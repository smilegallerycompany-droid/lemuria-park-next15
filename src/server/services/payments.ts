import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";
import { recordAuditLog } from "@/lib/audit";
import { DomainError } from "@/server/domain/errors";
import { getPaymentProvider } from "@/server/payments";
import { issueTicketsForOrder } from "@/server/services/tickets";
import { queueTicketEmail } from "@/server/services/ticket-delivery";
import { getErrorReporter } from "@/server/monitoring/error-reporter";
import type { OrderWithItems } from "@/server/services/orders";

export type OnlinePaymentStart = {
  configured: boolean;
  confirmationUrl: string | null;
  paymentStatus: string | null;
  providerPaymentId: string | null;
};

/**
 * Creates (or reuses) a PENDING CARD_ONLINE payment for an AWAITING_PAYMENT order.
 * If ЮKassa credentials are missing, returns configured:false — never fakes success.
 */
export async function startOnlinePayment(order: OrderWithItems): Promise<OnlinePaymentStart> {
  if (order.status !== "AWAITING_PAYMENT") {
    const existing = await prisma.payment.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: "desc" },
    });
    return {
      configured: getPaymentProvider().configured,
      confirmationUrl: existing?.confirmationUrl ?? null,
      paymentStatus: existing?.status ?? null,
      providerPaymentId: existing?.providerPaymentId ?? null,
    };
  }

  const existingPending = await prisma.payment.findFirst({
    where: {
      orderId: order.id,
      method: "CARD_ONLINE",
      status: "PENDING",
      confirmationUrl: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existingPending?.confirmationUrl) {
    return {
      configured: true,
      confirmationUrl: existingPending.confirmationUrl,
      paymentStatus: existingPending.status,
      providerPaymentId: existingPending.providerPaymentId,
    };
  }

  const provider = getPaymentProvider();
  if (!provider.configured) {
    return {
      configured: false,
      confirmationUrl: null,
      paymentStatus: null,
      providerPaymentId: null,
    };
  }

  const idempotencyKey = `order-pay-${order.id}`;
  try {
    const created = await provider.createPayment({
      orderId: order.id,
      orderNumber: order.number,
      amountKopecks: order.totalAmount,
      description: `Лемурия Парк · заказ ${order.number}`,
      returnUrl: `${env.NEXT_PUBLIC_APP_URL}/checkout/payment?order=${encodeURIComponent(order.number)}`,
      idempotencyKey,
      customerEmail: order.customerEmail,
    });

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        method: "CARD_ONLINE",
        status: "PENDING",
        amount: order.totalAmount,
        currency: "RUB",
        provider: created.provider,
        providerPaymentId: created.providerPaymentId,
        idempotencyKey,
        confirmationUrl: created.confirmationUrl,
        payload: created as object,
      },
    });

    await recordAuditLog(prisma, {
      action: "PAYMENT_CREATED",
      entityType: "Payment",
      entityId: payment.id,
      metadata: { orderId: order.id, providerPaymentId: created.providerPaymentId },
    });

    return {
      configured: true,
      confirmationUrl: payment.confirmationUrl,
      paymentStatus: payment.status,
      providerPaymentId: payment.providerPaymentId,
    };
  } catch (error) {
    getErrorReporter().captureException(error, {
      event: "PAYMENT_CREATE_FAILED",
      tags: { orderNumber: order.number, orderId: order.id },
    });
    throw error;
  }
}

/**
 * Applies a YooKassa webhook. Only marks PAID on real provider SUCCEEDED.
 * Rejects when provider is not configured or payload lacks object.id.
 */
export async function applyYooKassaWebhook(payload: unknown): Promise<{ handled: boolean }> {
  const provider = getPaymentProvider();
  if (!provider.configured) {
    getErrorReporter().captureMessage("Webhook rejected: YooKassa not configured", {
      event: "PAYMENT_WEBHOOK_INVALID",
      tags: { reason: "NOT_CONFIGURED" },
    });
    throw new DomainError(
      "PAYMENT_NOT_CONFIGURED",
      "ЮKassa не настроена — webhook отклонён",
    );
  }

  let update;
  try {
    update = provider.parseWebhook(payload);
  } catch (error) {
    getErrorReporter().captureException(error, {
      event: "PAYMENT_WEBHOOK_INVALID",
      tags: { reason: "PARSE_FAILED" },
    });
    throw error;
  }

  const payment = await prisma.payment.findUnique({
    where: { providerPaymentId: update.providerPaymentId },
  });
  if (!payment) {
    // Unknown payment — acknowledge without inventing local state.
    return { handled: false };
  }

  if (update.status === "PENDING") {
    return { handled: true };
  }

  if (update.status === "CANCELLED" || update.status === "FAILED") {
    if (payment.status === "PENDING") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: update.status === "FAILED" ? "FAILED" : "CANCELLED",
          payload: update.raw as object,
        },
      });
    }
    return { handled: true };
  }

  if (update.status !== "SUCCEEDED") {
    return { handled: true };
  }

  // Idempotent: duplicate SUCCEEDED webhooks must not double-issue tickets.
  if (payment.status === "SUCCEEDED") {
    return { handled: true };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: "SUCCEEDED" } },
        data: { status: "SUCCEEDED", payload: update.raw as object },
      });
      if (claimed.count === 0) {
        return;
      }

      const order = await tx.order.findUnique({ where: { id: payment.orderId } });
      if (!order) {
        throw new DomainError("ORDER_NOT_FOUND", "Заказ для платежа не найден");
      }

      if (order.status !== "PAID") {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "PAID", paymentExpiresAt: null },
        });
      }

      await issueTicketsForOrder(order.id, tx);

      await recordAuditLog(tx, {
        action: "PAYMENT_SUCCEEDED",
        entityType: "Order",
        entityId: order.id,
        metadata: { providerPaymentId: update.providerPaymentId },
      });
    });
  } catch (error) {
    getErrorReporter().captureException(error, {
      event: "PAYMENT_WEBHOOK_APPLY_FAILED",
      tags: { providerPaymentId: update.providerPaymentId, orderId: payment.orderId },
    });
    throw error;
  }

  // Email is best-effort and must never fake success.
  await queueTicketEmail({ orderId: payment.orderId }).catch(() => undefined);

  return { handled: true };
}
