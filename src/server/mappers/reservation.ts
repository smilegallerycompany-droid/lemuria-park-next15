import { prisma } from "@/lib/db/prisma";
import type { ReservationDto, ReservationLineItemDto } from "@/types/dto/reservation";
import type { ReservationWithItems } from "@/server/services/reservations";

/** Maps an internal reservation row into the public-safe `ReservationDto`. */
export async function toReservationDto(
  reservation: ReservationWithItems,
): Promise<ReservationDto> {
  const [session, ticketTypes] = await Promise.all([
    prisma.session.findUnique({
      where: { id: reservation.sessionId },
      include: { location: { select: { name: true, city: true, slug: true, timezone: true } } },
    }),
    prisma.ticketType.findMany({
      where: { id: { in: reservation.items.map((item) => item.ticketTypeId) } },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const ticketTypeById = new Map(ticketTypes.map((ticketType) => [ticketType.id, ticketType]));

  const items: ReservationLineItemDto[] = reservation.items.map((item) => {
    const ticketType = ticketTypeById.get(item.ticketTypeId);
    const subtotalAmount = item.quantity * item.unitPriceAmount;
    return {
      ticketTypeCode: ticketType?.code ?? "UNKNOWN",
      ticketTypeName: ticketType?.name ?? "Билет",
      quantity: item.quantity,
      unitPriceAmount: item.unitPriceAmount,
      subtotalAmount,
    };
  });

  const totalAmount = items.reduce((sum, item) => sum + item.subtotalAmount, 0);

  return {
    id: reservation.publicId,
    status: reservation.status,
    expiresAt: reservation.expiresAt.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
    session: session
      ? {
          startsAt: session.startsAt.toISOString(),
          locationName: session.location.name,
          locationCity: session.location.city,
          locationSlug: session.location.slug,
          locationTimezone: session.location.timezone,
        }
      : null,
    customer: {
      name: reservation.customerName,
      phone: reservation.customerPhone,
      email: reservation.customerEmail,
    },
    items,
    totalAmount,
    currency: "RUB",
  };
}
