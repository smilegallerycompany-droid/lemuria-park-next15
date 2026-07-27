import { prisma } from "@/lib/db/prisma";
import { formatDateInTimezone, formatTimeInTimezone } from "@/lib/datetime";
import { maskEmail, maskPhone } from "@/lib/privacy";
import { DomainError } from "@/server/domain/errors";
import type { PublicOrderDto, PublicOrderItemDto } from "@/types/dto/order";
import type { OrderWithItems } from "@/server/services/orders";

/** Maps an internal order row into the public-safe `PublicOrderDto`. */
export async function toOrderDto(order: OrderWithItems): Promise<PublicOrderDto> {
  const [session, ticketTypes] = await Promise.all([
    prisma.session.findUnique({
      where: { id: order.sessionId },
      include: {
        location: { select: { name: true, city: true, address: true, timezone: true, slug: true } },
      },
    }),
    prisma.ticketType.findMany({
      where: { id: { in: order.items.map((item) => item.ticketTypeId) } },
      select: { id: true, code: true },
    }),
  ]);

  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "Сеанс, связанный с заказом, не найден");
  }

  const codeByTicketTypeId = new Map(
    ticketTypes.map((ticketType) => [ticketType.id, ticketType.code]),
  );

  const items: PublicOrderItemDto[] = order.items.map((item) => ({
    ticketTypeCode: codeByTicketTypeId.get(item.ticketTypeId) ?? "UNKNOWN",
    ticketTypeName: item.ticketTypeName,
    quantity: item.quantity,
    unitPrice: item.unitPriceAmount,
    subtotal: item.subtotalAmount,
  }));

  // No payment provider integration yet — always null (never a fake "paid"/"pending" value).
  const paymentStatus: string | null = null;

  return {
    number: order.number,
    status: order.status,
    paymentStatus,
    customerName: order.customerName,
    maskedPhone: maskPhone(order.customerPhone),
    maskedEmail: maskEmail(order.customerEmail),
    totalAmount: order.totalAmount,
    createdAt: order.createdAt.toISOString(),
    paymentExpiresAt: order.paymentExpiresAt?.toISOString() ?? null,
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
  };
}
