import { prisma } from "@/lib/db/prisma";
import {
  formatDateInTimezone,
  formatTimeInTimezone,
  startOfLocalDateInTimezone,
  todayInTimezone,
} from "@/lib/datetime";
import { DomainError } from "@/server/domain/errors";
import { computeAvailability } from "@/server/domain/availability.domain";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import { locationRepository } from "@/server/repositories/location.repository";
import { sessionRepository } from "@/server/repositories/session.repository";
import { reservationRepository } from "@/server/repositories/reservation.repository";
import { orderRepository } from "@/server/repositories/order.repository";
import { ticketTypeRepository } from "@/server/repositories/ticket-type.repository";
import { priceRuleRepository } from "@/server/repositories/price-rule.repository";
import {
  buildResolvedPrice,
  filterActiveRuleCandidates,
  pickActivePriceRule,
  resolveDayType,
} from "@/server/domain/pricing.domain";
import { expireStaleReservations } from "@/server/services/reservation-cleanup";
import { expireStalePaymentOrders } from "@/server/services/order-cleanup";
import type { CashierOrdersQuery } from "@/lib/validation/cashier";

export async function listCashierSessionsForToday(locationId?: string) {
  const now = new Date();
  await Promise.all([expireStaleReservations(prisma, now), expireStalePaymentOrders(prisma, now)]);

  const location = locationId
    ? await locationRepository.findById(prisma, locationId)
    : await locationRepository.findDefaultActive(prisma, now);
  if (!location) throw new DomainError("LOCATION_NOT_FOUND", "Активная локация не найдена");

  const date = todayInTimezone(location.timezone, now);
  const anchor = new Date(`${date}T00:00:00Z`);
  const rangeStart = new Date(anchor.getTime() - 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(anchor.getTime() + 2 * 24 * 60 * 60 * 1000);

  const candidates = await sessionRepository.listCandidates(prisma, {
    locationId: location.id,
    statuses: ["SCHEDULED", "OPEN"],
    from: rangeStart,
    to: rangeEnd,
    take: DOMAIN_CONFIG.maxSessionsPerQuery,
  });

  const sessions = candidates.filter(
    (session) => formatDateInTimezone(session.startsAt, location.timezone) === date,
  );

  const sessionIds = sessions.map((session) => session.id);
  const ticketTypes = await ticketTypeRepository.listActive(prisma);
  const [reservations, orders, priceRules] = await Promise.all([
    reservationRepository.findActiveForSessions(prisma, sessionIds, now),
    orderRepository.findOccupyingForSessions(prisma, sessionIds),
    priceRuleRepository.findActiveForLocationAndTicketTypes(prisma, {
      locationId: location.id,
      ticketTypeIds: ticketTypes.map((ticketType) => ticketType.id),
    }),
  ]);

  const reservedBySession = new Map<string, number>();
  for (const reservation of reservations) {
    const qty = reservation.items.reduce((sum, item) => sum + item.quantity, 0);
    reservedBySession.set(
      reservation.sessionId,
      (reservedBySession.get(reservation.sessionId) ?? 0) + qty,
    );
  }

  const orderedBySession = new Map<string, number>();
  for (const order of orders) {
    const qty = order.items.reduce((sum, item) => sum + item.quantity, 0);
    orderedBySession.set(order.sessionId, (orderedBySession.get(order.sessionId) ?? 0) + qty);
  }

  return {
    location: {
      city: location.city,
      venue: location.name,
      timezone: location.timezone,
    },
    date,
    ticketTypes: ticketTypes.map((ticketType) => {
      const dayType = resolveDayType(now, location.timezone);
      // Prices for "today" — used in the sale panel as a hint; final price is
      // always re-resolved server-side for the selected session's startsAt.
      const candidatesForType = filterActiveRuleCandidates(priceRules, {
        ticketTypeId: ticketType.id,
        dayType,
        atDate: now,
      });
      const rule = pickActivePriceRule(candidatesForType);
      return {
        code: ticketType.code,
        name: ticketType.name,
        unitPrice: rule ? buildResolvedPrice(ticketType, rule).unitPriceAmount : null,
      };
    }),
    sessions: sessions.map((session) => {
      const availability = computeAvailability({
        sessionId: session.id,
        capacity: session.capacity,
        reservedQuantity: reservedBySession.get(session.id) ?? 0,
        orderedQuantity: orderedBySession.get(session.id) ?? 0,
      });
      return {
        publicId: session.publicId,
        localTime: formatTimeInTimezone(session.startsAt, location.timezone),
        startsAt: session.startsAt.toISOString(),
        capacity: availability.capacity,
        sold: availability.booked,
        remaining: availability.available,
        soldOut: availability.available <= 0,
      };
    }),
  };
}

export async function listCashierOrders(
  query: CashierOrdersQuery,
  scope?: { locationIds?: string[] | null; cashierId?: string },
) {
  const now = new Date();
  const location = await locationRepository.findDefaultActive(prisma, now);
  const timezone = location?.timezone ?? "Europe/Moscow";
  const today = todayInTimezone(timezone, now);

  let from: Date | undefined;
  let status: "PAID" | "CANCELLED" | "ALL" | undefined = "ALL";

  switch (query.filter) {
    case "today":
      from = startOfLocalDateInTimezone(today, timezone);
      break;
    case "paid":
      status = "PAID";
      break;
    case "cancelled":
      status = "CANCELLED";
      break;
    case "all":
    default:
      break;
  }

  const locationIds =
    scope?.locationIds === null || scope?.locationIds === undefined
      ? undefined
      : scope.locationIds;

  const orders = await orderRepository.listForCashier(prisma, {
    status,
    from,
    search: query.search,
    take: 50,
    locationIds,
    cashierId: scope?.cashierId,
  });

  return orders.map((order) => ({
    number: order.number,
    status: order.status,
    source: order.source,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt.toISOString(),
    customerName: order.customerName,
    cashierName: order.cashier?.name ?? null,
    sessionTime: formatTimeInTimezone(order.session.startsAt, order.session.location.timezone),
    items: order.items.map((item) => ({
      ticketTypeName: item.ticketTypeName,
      quantity: item.quantity,
      subtotal: item.subtotalAmount,
    })),
  }));
}
