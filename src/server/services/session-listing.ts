import type { Session } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { formatDateInTimezone, formatTimeInTimezone, todayInTimezone } from "@/lib/datetime";
import { DomainError } from "@/server/domain/errors";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import {
  computeAvailability,
  classifySessionAvailability,
} from "@/server/domain/availability.domain";
import {
  buildResolvedPrice,
  filterActiveRuleCandidates,
  pickActivePriceRule,
  resolveDayType,
} from "@/server/domain/pricing.domain";
import { locationRepository } from "@/server/repositories/location.repository";
import { sessionRepository } from "@/server/repositories/session.repository";
import { ticketTypeRepository } from "@/server/repositories/ticket-type.repository";
import { priceRuleRepository } from "@/server/repositories/price-rule.repository";
import { reservationRepository } from "@/server/repositories/reservation.repository";
import { orderRepository } from "@/server/repositories/order.repository";
import { expireStaleReservations } from "@/server/services/reservation-cleanup";
import { expireStalePaymentOrders } from "@/server/services/order-cleanup";
import type { SessionsQuery } from "@/lib/validation/reservation";
import type { PublicSessionDto, PublicSessionsResponseDto } from "@/types/dto/session";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * SessionListingService — resolves the target location, lists candidate
 * sessions for one calendar day, then attaches live availability and
 * server-computed prices to each one.
 *
 * Deliberately batches everything across the *whole* set of sessions being
 * listed (reserved seats, ordered seats, price rules) instead of querying
 * per-session, to avoid N+1 database round trips. Never exposes internal
 * ids or `visitDurationMinutes`.
 */
export async function listPublicSessions(query: SessionsQuery): Promise<PublicSessionsResponseDto> {
  const location = query.locationSlug
    ? await locationRepository.findBySlug(prisma, query.locationSlug)
    : await locationRepository.findDefaultActive(prisma);

  if (!location) {
    throw new DomainError("LOCATION_NOT_FOUND", "Активная локация не найдена");
  }

  const now = new Date();
  await Promise.all([expireStaleReservations(prisma, now), expireStalePaymentOrders(prisma, now)]);

  const targetDate = query.date ?? todayInTimezone(location.timezone, now);

  // Widen the DB-level range by a day on each side to safely cover timezone
  // offsets, then filter to the exact requested local calendar date in JS.
  const anchor = new Date(`${targetDate}T00:00:00Z`);
  const rangeStart = new Date(anchor.getTime() - ONE_DAY_MS);
  const rangeEnd = new Date(anchor.getTime() + 2 * ONE_DAY_MS);

  const candidates = await sessionRepository.listCandidates(prisma, {
    locationId: location.id,
    statuses: ["SCHEDULED", "OPEN"],
    from: rangeStart,
    to: rangeEnd,
    take: DOMAIN_CONFIG.maxSessionsPerQuery,
  });

  const sessions = candidates.filter(
    (session) => formatDateInTimezone(session.startsAt, location.timezone) === targetDate,
  );

  if (sessions.length === 0) {
    return {
      location: {
        slug: location.slug,
        city: location.city,
        venue: location.name,
        timezone: location.timezone,
      },
      date: targetDate,
      sessions: [],
    };
  }

  const sessionIds = sessions.map((session) => session.id);
  const ticketTypes = await ticketTypeRepository.listActive(prisma);
  const ticketTypeIds = ticketTypes.map((ticketType) => ticketType.id);

  const [reservedBySession, orderedBySession, priceRules] = await Promise.all([
    aggregateReservedBySession(sessionIds, now),
    aggregateOrderedBySession(sessionIds),
    priceRuleRepository.findActiveForLocationAndTicketTypes(prisma, {
      locationId: location.id,
      ticketTypeIds,
    }),
  ]);

  const dtos = sessions
    .map((session) =>
      buildSessionDto(session, {
        timezone: location.timezone,
        reservedQuantity: reservedBySession.get(session.id) ?? 0,
        orderedQuantity: orderedBySession.get(session.id) ?? 0,
        ticketTypes,
        priceRules,
      }),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return {
    location: {
      slug: location.slug,
      city: location.city,
      venue: location.name,
      timezone: location.timezone,
    },
    date: targetDate,
    sessions: dtos,
  };
}

async function aggregateReservedBySession(
  sessionIds: string[],
  now: Date,
): Promise<Map<string, number>> {
  const reservations = await reservationRepository.findActiveForSessions(prisma, sessionIds, now);
  const bySession = new Map<string, number>();
  for (const reservation of reservations) {
    const quantity = reservation.items.reduce((sum, item) => sum + item.quantity, 0);
    bySession.set(reservation.sessionId, (bySession.get(reservation.sessionId) ?? 0) + quantity);
  }
  return bySession;
}

async function aggregateOrderedBySession(sessionIds: string[]): Promise<Map<string, number>> {
  const orders = await orderRepository.findOccupyingForSessions(prisma, sessionIds);
  const bySession = new Map<string, number>();
  for (const order of orders) {
    const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    bySession.set(order.sessionId, (bySession.get(order.sessionId) ?? 0) + quantity);
  }
  return bySession;
}

function buildSessionDto(
  session: Session,
  params: {
    timezone: string;
    reservedQuantity: number;
    orderedQuantity: number;
    ticketTypes: Awaited<ReturnType<typeof ticketTypeRepository.listActive>>;
    priceRules: Awaited<ReturnType<typeof priceRuleRepository.findActiveForLocationAndTicketTypes>>;
  },
): PublicSessionDto {
  const availability = computeAvailability({
    sessionId: session.id,
    capacity: session.capacity,
    reservedQuantity: params.reservedQuantity,
    orderedQuantity: params.orderedQuantity,
  });

  const dayType = resolveDayType(session.startsAt, params.timezone);
  // A ticket type with no configured price rule for this date is a
  // configuration gap, not a reason to fail the whole listing — it's simply
  // omitted here. Attempting to reserve that specific ticket type would
  // still correctly fail with PRICE_NOT_CONFIGURED.
  const prices = params.ticketTypes.flatMap((ticketType) => {
    const candidates = filterActiveRuleCandidates(params.priceRules, {
      ticketTypeId: ticketType.id,
      dayType,
      atDate: session.startsAt,
    });
    const rule = pickActivePriceRule(candidates);
    if (!rule) return [];
    const resolved = buildResolvedPrice(ticketType, rule);
    return [
      {
        ticketTypeCode: resolved.ticketTypeCode,
        ticketTypeName: resolved.ticketTypeName,
        unitPrice: resolved.unitPriceAmount,
      },
    ];
  });

  return {
    publicId: session.publicId,
    startsAt: session.startsAt.toISOString(),
    localDate: formatDateInTimezone(session.startsAt, params.timezone),
    localTime: formatTimeInTimezone(session.startsAt, params.timezone),
    capacity: availability.capacity,
    remainingSeats: availability.available,
    soldOut: availability.available <= 0,
    status: classifySessionAvailability(availability.available),
    prices,
  };
}
