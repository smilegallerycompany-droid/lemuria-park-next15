import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";
import { recordAuditLog } from "@/lib/audit";
import { DomainError } from "@/server/domain/errors";

export type TicketEmailResult = {
  status: "SENT" | "NOT_CONFIGURED" | "FAILED";
  message: string;
};

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
    await recordAuditLog(prisma, {
      actorId: params.actorId,
      action: "TICKET_EMAIL_SKIPPED",
      entityType: "Order",
      entityId: order.id,
      metadata: { reason: "EMAIL_NOT_CONFIGURED", to: order.customerEmail },
    });
    return {
      status: "NOT_CONFIGURED",
      message: "Отправка email не настроена (Yandex Postbox). Письмо не отправлено.",
    };
  }

  // SMTP send without adding a heavy dependency: use Node's fetch against a
  // lightweight relay is not available — call Postbox-compatible endpoint via
  // documented SMTP credentials through a minimal TCP-less path is not viable.
  // For production we use the Postbox HTTP API (AWS SES-compatible) when endpoint is set.
  if (!env.EMAIL_API_ENDPOINT || !env.EMAIL_API_KEY) {
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
    // SES-compatible SendEmail (Postbox). Signature/v4 can be added when keys arrive;
    // until then we require a pre-signed gateway or simple bearer if provided.
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
      await recordAuditLog(prisma, {
        actorId: params.actorId,
        action: "TICKET_EMAIL_FAILED",
        entityType: "Order",
        entityId: order.id,
        metadata: { status: res.status, body: body.slice(0, 300) },
      });
      return { status: "FAILED", message: "Провайдер email отклонил отправку" };
    }

    await recordAuditLog(prisma, {
      actorId: params.actorId,
      action: "TICKET_EMAIL_SENT",
      entityType: "Order",
      entityId: order.id,
      metadata: { to: order.customerEmail },
    });
    return { status: "SENT", message: "Письмо отправлено" };
  } catch (error) {
    await recordAuditLog(prisma, {
      actorId: params.actorId,
      action: "TICKET_EMAIL_FAILED",
      entityType: "Order",
      entityId: order.id,
      metadata: { error: error instanceof Error ? error.message : "unknown" },
    });
    return { status: "FAILED", message: "Не удалось связаться с почтовым сервисом" };
  }
}
