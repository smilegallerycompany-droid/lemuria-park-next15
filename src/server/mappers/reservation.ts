import { prisma } from "@/lib/db/prisma";
import type { ReservationWithItems } from "@/server/services/reservations";

export interface ReservationItemResponse {
  ticketTypeCode: string;
  ticketTypeName: string;
  quantity: number;
  unitPriceAmount: number;
  subtotalAmount: number;
}

export interface ReservationResponse {
  id: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  session: {
    startsAt: string;
    locationName: string;
    locationCity: string;
    locationSlug: string;
  } | null;
  customer: {
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  items: ReservationItemResponse[];
  totalAmount: number;
  currency: string;
}

/** Maps an internal reservation row into the public-safe API response shape. */
export async function toReservationResponse(
  reservation: ReservationWithItems,
): Promise<ReservationResponse> {
  const [session, ticketTypes] = await Promise.all([
    prisma.session.findUnique({
      where: { id: reservation.sessionId },
      include: { location: { select: { name: true, city: true, slug: true } } },
    }),
    prisma.ticketType.findMany({
      where: { id: { in: reservation.items.map((item) => item.ticketTypeId) } },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const ticketTypeById = new Map(ticketTypes.map((ticketType) => [ticketType.id, ticketType]));

  const items: ReservationItemResponse[] = reservation.items.map((item) => {
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
