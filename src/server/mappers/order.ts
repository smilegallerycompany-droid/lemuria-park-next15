import { prisma } from "@/lib/db/prisma";
import type { OrderDto, OrderLineItemDto } from "@/types/dto/order";
import type { OrderWithItems } from "@/server/services/orders";

/** Maps an internal order row into the public-safe `OrderDto`. */
export async function toOrderDto(order: OrderWithItems): Promise<OrderDto> {
  const [session, ticketTypes] = await Promise.all([
    prisma.session.findUnique({
      where: { id: order.sessionId },
      include: { location: { select: { name: true, city: true, slug: true, timezone: true } } },
    }),
    prisma.ticketType.findMany({
      where: { id: { in: order.items.map((item) => item.ticketTypeId) } },
      select: { id: true, code: true },
    }),
  ]);

  const codeByTicketTypeId = new Map(ticketTypes.map((ticketType) => [ticketType.id, ticketType.code]));

  const items: OrderLineItemDto[] = order.items.map((item) => ({
    ticketTypeCode: codeByTicketTypeId.get(item.ticketTypeId) ?? "UNKNOWN",
    ticketTypeName: item.ticketTypeName,
    quantity: item.quantity,
    unitPriceAmount: item.unitPriceAmount,
    subtotalAmount: item.subtotalAmount,
  }));

  return {
    number: order.number,
    status: order.status,
    source: order.source,
    createdAt: order.createdAt.toISOString(),
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
      name: order.customerName,
      phone: order.customerPhone,
      email: order.customerEmail,
    },
    items,
    totalAmount: order.totalAmount,
    currency: order.currency,
  };
}
