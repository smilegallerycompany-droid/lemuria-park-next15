import { prisma } from "@/lib/db/prisma";
import { labelPaymentMethod, labelStatus } from "@/lib/director/labels";

export type TimelineEvent = {
  type: string;
  at: string;
  title: string;
  detail?: string | null;
};

export async function buildOrderTimeline(orderNumber: string): Promise<TimelineEvent[]> {
  const order = await prisma.order.findUnique({
    where: { number: orderNumber },
    include: {
      reservation: true,
      payments: { orderBy: { createdAt: "asc" } },
      refunds: { orderBy: { createdAt: "asc" } },
      tickets: {
        include: { checkIns: { orderBy: { scannedAt: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
      deliveries: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) return [];

  const events: TimelineEvent[] = [];

  if (order.reservation) {
    events.push({
      type: "RESERVATION_CREATED",
      at: order.reservation.createdAt.toISOString(),
      title: "Бронь создана",
      detail: order.reservation.publicId,
    });
  }

  events.push({
    type: "ORDER_CREATED",
    at: order.createdAt.toISOString(),
    title: "Заказ создан",
    detail: order.number,
  });

  for (const payment of order.payments) {
    events.push({
      type: "PAYMENT_CREATED",
      at: payment.createdAt.toISOString(),
      title: "Платёж создан",
      detail: `${labelPaymentMethod(payment.method)} · ${labelStatus(payment.status)}`,
    });
    if (payment.status === "SUCCEEDED") {
      events.push({
        type: "PAYMENT_SUCCEEDED",
        at: payment.updatedAt.toISOString(),
        title: "Оплата прошла",
        detail: payment.providerPaymentId,
      });
    }
    if (payment.status === "CANCELLED") {
      events.push({
        type: "PAYMENT_CANCELLED",
        at: payment.updatedAt.toISOString(),
        title: "Платёж отменён",
      });
    }
  }

  if (order.tickets.length > 0) {
    const firstTicket = order.tickets[0]!;
    events.push({
      type: "TICKETS_ISSUED",
      at: firstTicket.createdAt.toISOString(),
      title: "Билеты выданы",
      detail: `${order.tickets.length} шт.`,
    });
  }

  for (const delivery of order.deliveries) {
    events.push({
      type:
        delivery.status === "SENT"
          ? "EMAIL_SENT"
          : delivery.status === "FAILED"
            ? "EMAIL_FAILED"
            : "EMAIL_ATTEMPT",
      at: delivery.createdAt.toISOString(),
      title:
        delivery.status === "SENT"
          ? "Письмо отправлено"
          : delivery.status === "FAILED"
            ? "Письмо не отправилось"
            : "Попытка отправить письмо",
      detail: delivery.toAddress,
    });
  }

  for (const ticket of order.tickets) {
    for (const checkIn of ticket.checkIns) {
      if (checkIn.result === "SUCCESS") {
        events.push({
          type: "CHECK_IN",
          at: checkIn.scannedAt.toISOString(),
          title: "Проход",
          detail: ticket.publicId,
        });
      }
    }
  }

  if (order.status === "CANCELLED") {
    events.push({
      type: "ORDER_CANCELLED",
      at: order.updatedAt.toISOString(),
      title: "Заказ отменён",
    });
  }

  for (const refund of order.refunds) {
    events.push({
      type: "REFUND_CREATED",
      at: refund.createdAt.toISOString(),
      title: "Возврат создан",
      detail: refund.reason,
    });
    if (refund.status === "COMPLETED" || refund.status === "SUCCEEDED") {
      events.push({
        type: "REFUND_SUCCEEDED",
        at: refund.updatedAt.toISOString(),
        title: "Возврат выполнен",
      });
    }
  }

  const audit = await prisma.auditLog.findMany({
    where: {
      entityType: { in: ["Order", "Payment"] },
      OR: [{ entityId: order.id }, { entityId: order.number }],
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  for (const row of audit) {
    if (row.action.includes("WEBHOOK")) {
      events.push({
        type: "WEBHOOK_RECEIVED",
        at: row.createdAt.toISOString(),
        title: row.action,
      });
    }
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}
