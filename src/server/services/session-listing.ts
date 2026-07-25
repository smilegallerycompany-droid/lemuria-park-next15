import { prisma } from "@/lib/db/prisma";
import { formatDateInTimezone } from "@/lib/datetime";
import { DomainError } from "@/server/domain/errors";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import { locationRepository } from "@/server/repositories/location.repository";
import { sessionRepository } from "@/server/repositories/session.repository";
import { ticketTypeRepository } from "@/server/repositories/ticket-type.repository";
import { expireStaleReservations } from "@/server/services/reservation-cleanup";
import { getSessionAvailability } from "@/server/services/availability";
import { resolveTicketPrice } from "@/server/services/pricing";
import type { SessionsQuery } from "@/lib/validation/reservation";
import type { SessionsResponseDto } from "@/types/dto/session";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * SessionListingService — resolves the target location, lists candidate
 * sessions in the requested window, then attaches live availability
 * (AvailabilityService) and server-computed prices (PricingService) to
 * each one. Never exposes internal ids or `visitDurationMinutes`.
 */
export async function listPublicSessions(query: SessionsQuery): Promise<SessionsResponseDto> {
  const location = query.locationSlug
    ? await locationRepository.findBySlug(prisma, query.locationSlug)
    : await locationRepository.findDefaultActive(prisma);

  if (!location) {
    throw new DomainError("LOCATION_NOT_FOUND", "Активная локация не найдена");
  }

  const now = new Date();
  await expireStaleReservations(prisma, now);

  // Widen the DB-level range by a day on each side to safely cover timezone
  // offsets, then filter to the exact requested local calendar date in JS.
  const anchor = query.date ? new Date(`${query.date}T00:00:00Z`) : now;
  const rangeStart = new Date(anchor.getTime() - ONE_DAY_MS);
  const rangeEnd = new Date(
    anchor.getTime() + (DOMAIN_CONFIG.sessionsLookaheadDays + 2) * ONE_DAY_MS,
  );

  const candidates = await sessionRepository.listCandidates(prisma, {
    locationId: location.id,
    statuses: ["SCHEDULED", "OPEN"],
    from: rangeStart,
    to: rangeEnd,
    take: DOMAIN_CONFIG.maxSessionsPerQuery,
  });

  const filtered = candidates.filter((session) =>
    query.date
      ? formatDateInTimezone(session.startsAt, location.timezone) === query.date
      : session.startsAt.getTime() > now.getTime(),
  );

  const ticketTypes = await ticketTypeRepository.listActive(prisma);

  const sessions = await Promise.all(
    filtered.map(async (session) => {
      const [availability, prices] = await Promise.all([
        getSessionAvailability(prisma, session.id, now),
        Promise.all(
          ticketTypes.map(async (ticketType) => {
            const price = await resolveTicketPrice(prisma, {
              locationId: location.id,
              ticketTypeId: ticketType.id,
              timezone: location.timezone,
              atDate: session.startsAt,
            });
            return {
              ticketTypeCode: price.ticketTypeCode,
              ticketTypeName: price.ticketTypeName,
              unitPriceAmount: price.unitPriceAmount,
            };
          }),
        ),
      ]);

      return {
        id: session.publicId,
        startsAt: session.startsAt.toISOString(),
        status: session.status,
        capacity: availability.capacity,
        available: availability.available,
        prices,
      };
    }),
  );

  return {
    location: {
      slug: location.slug,
      name: location.name,
      city: location.city,
      timezone: location.timezone,
    },
    sessions,
  };
}
