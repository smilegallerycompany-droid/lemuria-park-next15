import { prisma } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { DomainError } from "@/server/domain/errors";
import { SUCCESSFUL_REFUND_STATUSES } from "@/server/domain/shift.domain";
import { createYooKassaRefund } from "@/server/payments/yookassa-refund";
import { randomUUID } from "node:crypto";

/**
 * Full refund workflow only (partial deferred — see docs).
 * Online CARD_ONLINE requires YooKassa success before order → REFUNDED.
 * Cash / terminal refunds complete locally under director/admin authority.
 */
export async function initiateFullRefund(params: {
  orderNumber: string;
  actorId: string;
  reason: string;
  ip?: string | null;
  ua?: string | null;
}) {
  const order = await prisma.order.findUnique({
    where: { number: params.orderNumber },
    include: {
      tickets: true,
      refunds: true,
      payments: { where: { status: { in: ["SUCCEEDED", "REFUNDED"] } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) throw new DomainError("ORDER_NOT_FOUND", "Заказ не найден");
  if (order.status !== "PAID") {
    throw new DomainError("ORDER_NOT_PAID", "Возврат доступен только для оплаченных заказов");
  }

  const alreadyRefunded = order.refunds
    .filter((r) => (SUCCESSFUL_REFUND_STATUSES as readonly string[]).includes(r.status))
    .reduce((s, r) => s + r.amount, 0);
  if (alreadyRefunded >= order.totalAmount) {
    throw new DomainError("REFUND_AMOUNT_INVALID", "Заказ уже возвращён");
  }

  const amount = order.totalAmount - alreadyRefunded;
  const payment = order.payments.find((p) => p.status === "SUCCEEDED") ?? order.payments[0];
  if (!payment) {
    throw new DomainError("ORDER_NOT_PAID", "Нет успешного платежа для возврата");
  }

  // Duplicate in-flight protection
  const pending = order.refunds.find((r) => r.status === "PENDING");
  if (pending) {
    return { refund: pending, orderStatus: order.status, provider: "pending" as const };
  }

  if (payment.method === "CARD_ONLINE") {
    if (!payment.providerPaymentId) {
      throw new DomainError("PAYMENT_PROVIDER_ERROR", "Нет provider payment id");
    }

    const refundRow = await prisma.refund.create({
      data: {
        orderId: order.id,
        paymentId: payment.id,
        amount,
        status: "PENDING",
        reason: params.reason,
        actorId: params.actorId,
      },
    });

    try {
      const provider = await createYooKassaRefund({
        providerPaymentId: payment.providerPaymentId,
        amountKopecks: amount,
        idempotencyKey: `refund-${refundRow.id}`,
        reason: params.reason,
      });

      if (provider.status !== "SUCCEEDED") {
        const updated = await prisma.refund.update({
          where: { id: refundRow.id },
          data: {
            status: provider.status === "PENDING" ? "PENDING" : provider.status,
            providerRefundId: provider.providerRefundId,
          },
        });
        await recordAuditLog(prisma, {
          actorId: params.actorId,
          action: "ORDER_REFUND_PENDING",
          entityType: "Refund",
          entityId: updated.id,
          metadata: { orderNumber: order.number, providerStatus: provider.status },
          ipAddress: params.ip,
          userAgent: params.ua,
        });
        return { refund: updated, orderStatus: order.status, provider: "yookassa" as const };
      }

      return finalizeSuccessfulRefund({
        refundId: refundRow.id,
        orderId: order.id,
        paymentId: payment.id,
        amount,
        actorId: params.actorId,
        providerRefundId: provider.providerRefundId,
        reason: params.reason,
        ip: params.ip,
        ua: params.ua,
      });
    } catch (error) {
      await prisma.refund.update({
        where: { id: refundRow.id },
        data: { status: "FAILED" },
      });
      throw error;
    }
  }

  // Local cash / terminal refund (director/admin)
  const refundRow = await prisma.refund.create({
    data: {
      orderId: order.id,
      paymentId: payment.id,
      amount,
      status: "PENDING",
      reason: params.reason,
      actorId: params.actorId,
      providerRefundId: `local-${randomUUID()}`,
    },
  });

  return finalizeSuccessfulRefund({
    refundId: refundRow.id,
    orderId: order.id,
    paymentId: payment.id,
    amount,
    actorId: params.actorId,
    providerRefundId: refundRow.providerRefundId,
    reason: params.reason,
    ip: params.ip,
    ua: params.ua,
    cashShiftId: order.shiftId,
  });
}

async function finalizeSuccessfulRefund(params: {
  refundId: string;
  orderId: string;
  paymentId: string;
  amount: number;
  actorId: string;
  providerRefundId?: string | null;
  reason: string;
  ip?: string | null;
  ua?: string | null;
  cashShiftId?: string | null;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const refund = await tx.refund.update({
      where: { id: params.refundId },
      data: {
        status: "SUCCEEDED",
        completedAt: new Date(),
        providerRefundId: params.providerRefundId ?? undefined,
      },
    });

    await tx.order.update({
      where: { id: params.orderId },
      data: { status: "REFUNDED" },
    });

    await tx.ticket.updateMany({
      where: { orderId: params.orderId, status: { in: ["VALID", "USED"] } },
      data: { status: "REFUNDED" },
    });

    await tx.payment.update({
      where: { id: params.paymentId },
      data: { status: "REFUNDED" },
    });

    if (params.cashShiftId) {
      const payment = await tx.payment.findUnique({ where: { id: params.paymentId } });
      if (payment?.method === "CASH") {
        await tx.cashierShift.update({
          where: { id: params.cashShiftId },
          data: { cashRefundsAmount: { increment: params.amount } },
        });
        await tx.cashOperation.create({
          data: {
            shiftId: params.cashShiftId,
            userId: params.actorId,
            type: "REFUND",
            amount: params.amount,
            orderId: params.orderId,
            comment: params.reason,
          },
        });
      }
    }

    await recordAuditLog(tx, {
      actorId: params.actorId,
      action: "ORDER_REFUND_SUCCEEDED",
      entityType: "Order",
      entityId: params.orderId,
      metadata: {
        refundId: refund.id,
        amount: params.amount,
        reason: params.reason,
      },
      ipAddress: params.ip,
      userAgent: params.ua,
    });

    return refund;
  });

  return { refund: result, orderStatus: "REFUNDED" as const, provider: "local_or_yookassa" as const };
}
