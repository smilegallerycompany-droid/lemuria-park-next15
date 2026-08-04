import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";
import { recordAuditLog } from "@/lib/audit";
import { DomainError } from "@/server/domain/errors";
import { getErrorReporter } from "@/server/monitoring/error-reporter";

export type TicketEmailResult = {
  status: "SENT" | "NOT_CONFIGURED" | "FAILED";
  message: string;
};

async function recordDelivery(params: {
  orderId: string;
  toAddress: string;
  status: "SENT" | "NOT_CONFIGURED" | "FAILED";
  errorMessage?: string;
  actorId?: string;
}) {
  await prisma.ticketDelivery.create({
    data: {
      orderId: params.orderId,
      channel: "EMAIL",
      toAddress: params.toAddress,
      status: params.status,
      errorMessage: params.errorMessage ?? null,
      actorId: params.actorId ?? null,
    },
  });
}

/**
 * Sends ticket email via Yandex Cloud Postbox (SMTP over HTTPS API later).
 * Until credentials are set — returns NOT_CONFIGURED and never pretends the email was sent.
 */
export async function queueTicketEmail(params: {
  orderId: string;
  actorId?: string;
}): Promise<TicketEmailResult> {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { tickets: true, session: { include: { location: true } } },
  });
  if (!order) throw new DomainError("ORDER_NOT_FOUND", "Заказ не найден");
  if (order.status !== "PAID") {
    throw new DomainError("ORDER_NOT_PAID", "Письмо отправляется только для оплаченных заказов");
  }

  const configured =
    env.EMAIL_PROVIDER === "yandex_postbox" &&
    Boolean(env.EMAIL_FROM && env.EMAIL_SMTP_HOST && env.EMAIL_SMTP_USER && env.EMAIL_SMTP_PASSWORD);

  if (!configured) {
    await recordDelivery({
      orderId: order.id,
      toAddress: order.customerEmail,
      status: "NOT_CONFIGURED",
      errorMessage: "EMAIL_NOT_CONFIGURED",
      actorId: params.actorId,
    });
    await recordAuditLog(prisma, {
      actorId: params.actorId,
      action: "TICKET_EMAIL_SKIPPED",
      entityType: "Order",
      entityId: order.id,
      metadata: { reason: "EMAIL_NOT_CONFIGURED" },
    });
    return {
      status: "NOT_CONFIGURED",
      message: "Отправка email не настроена (Yandex Postbox). Письмо не отправлено.",
    };
  }

  if (!env.EMAIL_API_ENDPOINT || !env.EMAIL_API_KEY) {
    await recordDelivery({
      orderId: order.id,
      toAddress: order.customerEmail,
      status: "NOT_CONFIGURED",
      errorMessage: "EMAIL_API_NOT_CONFIGURED",
      actorId: params.actorId,
    });
    await recordAuditLog(prisma, {
      actorId: params.actorId,
      action: "TICKET_EMAIL_SKIPPED",
      entityType: "Order",
      entityId: order.id,
      metadata: { reason: "EMAIL_API_NOT_CONFIGURED" },
    });
    return {
      status: "NOT_CONFIGURED",
      message: "Yandex Postbox API не настроена. Письмо не отправлено.",
    };
  }

  const ticketUrl = `${env.NEXT_PUBLIC_APP_URL}/success?order=${encodeURIComponent(order.number)}`;
  const subject = `Билеты Лемурия Парк · ${order.number}`;
  const text = [
    `Здравствуйте, ${order.customerName}!`,
    ``,
    `Заказ ${order.number} оплачен.`,
    `Место: ${order.session.location.name}`,
    `Билетов: ${order.tickets.length}`,
    `Открыть билеты: ${ticketUrl}`,
  ].join("\n");

  try {
    const res = await fetch(env.EMAIL_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [order.customerEmail],
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      await recordDelivery({
        orderId: order.id,
        toAddress: order.customerEmail,
        status: "FAILED",
        errorMessage: `HTTP ${res.status}: ${body.slice(0, 300)}`,
        actorId: params.actorId,
      });
      await recordAuditLog(prisma, {
        actorId: params.actorId,
        action: "TICKET_EMAIL_FAILED",
        entityType: "Order",
        entityId: order.id,
        metadata: { status: res.status },
      });
      getErrorReporter().captureMessage("Ticket email provider rejected send", {
        event: "TICKET_EMAIL_FAILED",
        tags: { orderId: order.id, httpStatus: res.status },
      });
      return { status: "FAILED", message: "Провайдер email отклонил отправку" };
    }

    await recordDelivery({
      orderId: order.id,
      toAddress: order.customerEmail,
      status: "SENT",
      actorId: params.actorId,
    });
    await recordAuditLog(prisma, {
      actorId: params.actorId,
      action: "TICKET_EMAIL_SENT",
      entityType: "Order",
      entityId: order.id,
      metadata: { orderNumber: order.number },
    });
    return { status: "SENT", message: "Письмо отправлено" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    await recordDelivery({
      orderId: order.id,
      toAddress: order.customerEmail,
      status: "FAILED",
      errorMessage: message,
      actorId: params.actorId,
    });
    await recordAuditLog(prisma, {
      actorId: params.actorId,
      action: "TICKET_EMAIL_FAILED",
      entityType: "Order",
      entityId: order.id,
      metadata: { error: message.slice(0, 200) },
    });
    getErrorReporter().captureException(error, {
      event: "TICKET_EMAIL_FAILED",
      tags: { orderId: order.id },
    });
    return { status: "FAILED", message: "Не удалось связаться с почтовым сервисом" };
  }
}
