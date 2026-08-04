import { prisma } from "@/lib/db/prisma";
import { formatDateInTimezone, formatTimeInTimezone } from "@/lib/datetime";
import { maskEmail, maskPhone } from "@/lib/privacy";
import { DomainError } from "@/server/domain/errors";
import { getPaymentProvider } from "@/server/payments";
import { startOnlinePayment } from "@/server/services/payments";
import type { PublicOrderDto, PublicOrderItemDto } from "@/types/dto/order";
import type { OrderWithItems } from "@/server/services/orders";

/** Maps an internal order row into the public-safe `PublicOrderDto`. */
export async function toOrderDto(
  order: OrderWithItems,
  options?: { ensurePayment?: boolean },
): Promise<PublicOrderDto> {
  const [session, ticketTypes, tickets] = await Promise.all([
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
    prisma.ticket.findMany({
      where: { orderId: order.id },
      select: { publicId: true, qrToken: true, status: true },
      orderBy: { createdAt: "asc" },
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

  let paymentStatus: string | null = null;
  let confirmationUrl: string | null = null;
  const paymentConfigured = getPaymentProvider().configured;

  if (options?.ensurePayment !== false && order.status === "AWAITING_PAYMENT") {
    try {
      const payment = await startOnlinePayment(order);
      paymentStatus = payment.paymentStatus;
      confirmationUrl = payment.confirmationUrl;
    } catch {
      const existing = await prisma.payment.findFirst({
        where: { orderId: order.id },
        orderBy: { createdAt: "desc" },
      });
      paymentStatus = existing?.status ?? null;
      confirmationUrl = existing?.confirmationUrl ?? null;
    }
  } else {
    const existing = await prisma.payment.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: "desc" },
    });
    paymentStatus = existing?.status ?? null;
    confirmationUrl = existing?.confirmationUrl ?? null;
  }

  return {
    number: order.number,
    status: order.status,
    paymentStatus,
    confirmationUrl,
    paymentConfigured,
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
    tickets:
      order.status === "PAID"
        ? tickets.map((t) => ({
            publicId: t.publicId,
            qrToken: t.qrToken,
            status: t.status,
          }))
        : [],
  };
}
