import { prisma } from "@/lib/db/prisma";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { sessionsQuerySchema } from "@/lib/validation/reservation";
import { formatDateInTimezone } from "@/lib/datetime";
import { expireStaleReservations } from "@/server/services/reservation-cleanup";
import { getSessionAvailability } from "@/server/services/availability";
import { resolveTicketPrice } from "@/server/services/pricing";

const LOOKAHEAD_DAYS = 14;
const MAX_SESSIONS = 200;

/**
 * Public sessions listing for a location (defaults to the current active
 * touring location) with live availability and server-computed prices.
 * Never exposes internal ids or `visitDurationMinutes`.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = sessionsQuerySchema.parse({
      locationSlug: url.searchParams.get("locationSlug") ?? undefined,
      date: url.searchParams.get("date") ?? undefined,
    });

    const location = query.locationSlug
      ? await prisma.location.findFirst({
          where: { slug: query.locationSlug, status: { in: ["ACTIVE", "UPCOMING"] } },
        })
      : await prisma.location.findFirst({
          where: { status: "ACTIVE" },
          orderBy: { activeFrom: "asc" },
        });

    if (!location) {
      return apiError("NOT_FOUND", "Активная локация не найдена", 404);
    }

    const now = new Date();
    await expireStaleReservations(prisma, now);

    // Widen the DB-level range by a day on each side to safely cover timezone
    // offsets, then filter to the exact requested local calendar date in JS.
    const anchor = query.date ? new Date(`${query.date}T00:00:00Z`) : now;
    const rangeStart = new Date(anchor.getTime() - 24 * 60 * 60 * 1000);
    const rangeEnd = new Date(anchor.getTime() + (LOOKAHEAD_DAYS + 2) * 24 * 60 * 60 * 1000);

    const candidateSessions = await prisma.session.findMany({
      where: {
        locationId: location.id,
        status: { in: ["SCHEDULED", "OPEN"] },
        startsAt: { gte: rangeStart, lte: rangeEnd },
      },
      orderBy: { startsAt: "asc" },
      take: MAX_SESSIONS,
    });

    const filtered = candidateSessions.filter((session) =>
      query.date
        ? formatDateInTimezone(session.startsAt, location.timezone) === query.date
        : session.startsAt.getTime() > now.getTime(),
    );

    const ticketTypes = await prisma.ticketType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

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

    return apiSuccess({
      location: {
        slug: location.slug,
        name: location.name,
        city: location.city,
        timezone: location.timezone,
      },
      sessions,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
