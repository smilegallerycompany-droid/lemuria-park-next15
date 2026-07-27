import { prisma } from "@/lib/db/prisma";
import { formatDateInTimezone, formatTimeInTimezone } from "@/lib/datetime";
import { DomainError } from "@/server/domain/errors";
import type { PublicReservationDto, PublicReservationItemDto } from "@/types/dto/reservation";
import type { ReservationWithItems } from "@/server/services/reservations";

/** Maps an internal reservation row into the public-safe `PublicReservationDto`. */
export async function toReservationDto(
  reservation: ReservationWithItems,
): Promise<PublicReservationDto> {
  const [session, ticketTypes] = await Promise.all([
    prisma.session.findUnique({
      where: { id: reservation.sessionId },
      include: {
        location: { select: { name: true, city: true, address: true, timezone: true, slug: true } },
      },
    }),
    prisma.ticketType.findMany({
      where: { id: { in: reservation.items.map((item) => item.ticketTypeId) } },
      select: { id: true, code: true, name: true },
    }),
  ]);

  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "Сеанс, связанный с резервированием, не найден");
  }

  const ticketTypeById = new Map(ticketTypes.map((ticketType) => [ticketType.id, ticketType]));

  const items: PublicReservationItemDto[] = reservation.items.map((item) => {
    const ticketType = ticketTypeById.get(item.ticketTypeId);
    return {
      ticketTypeCode: ticketType?.code ?? "UNKNOWN",
      ticketTypeName: ticketType?.name ?? "Билет",
      quantity: item.quantity,
      unitPrice: item.unitPriceAmount,
      subtotal: item.quantity * item.unitPriceAmount,
    };
  });

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  return {
    publicId: reservation.publicId,
    status: reservation.status,
    expiresAt: reservation.expiresAt.toISOString(),
    session: {
      publicId: session.publicId,
      startsAt: session.startsAt.toISOString(),
      localDate: formatDateInTimezone(session.startsAt, session.location.timezone),
      localTime: formatTimeInTimezone(session.startsAt, session.location.timezone),
      city: session.location.city,
      venue: session.location.name,
      address: session.location.address,
      timezone: session.location.timezone,
    },
    items,
    totalQuantity,
    totalAmount,
  };
}
