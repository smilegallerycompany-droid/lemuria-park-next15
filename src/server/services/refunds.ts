import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { DomainError } from "@/server/domain/errors";
import { SUCCESSFUL_REFUND_STATUSES } from "@/server/domain/shift.domain";
import { createYooKassaRefund } from "@/server/payments/yookassa-refund";
import { env } from "@/lib/config/env";
import { randomUUID } from "node:crypto";

export type RefundActorRole = UserRole;

function isSuccessfulRefundStatus(status: string): boolean {
  return (SUCCESSFUL_REFUND_STATUSES as readonly string[]).includes(status);
}

/** Staging never calls ЮKassa. Cash/terminal always local. */
export function shouldRefundLocally(params: {
  appEnv: string | undefined | null;
  paymentMethod: string;
  paymentProvider: string | null | undefined;
}): boolean {
  if (params.appEnv === "staging") return true;
  if (params.paymentProvider === "staging_test") return true;
  if (params.paymentMethod !== "CARD_ONLINE") return true;
  return false;
}

export function refundAmountForTickets(
  tickets: Array<{ status: string; unitPriceAmount: number }>,
): number {
  return tickets.reduce((sum, ticket) => sum + ticket.unitPriceAmount, 0);
}

export function assertTicketsRefundable(params: {
  tickets: Array<{ id: string; status: string }>;
  allowUsed: boolean;
}): void {
  for (const ticket of params.tickets) {
    if (ticket.status === "REFUNDED" || ticket.status === "CANCELLED") {
      throw new DomainError("REFUND_NOT_ALLOWED", "Этот билет уже возвращён или отменён");
    }
    if (ticket.status === "USED" && !params.allowUsed) {
      throw new DomainError(
        "REFUND_NOT_ALLOWED",
        "Использованный билет нельзя вернуть без отдельного разрешения владельца",
      );
    }
  }
}

/**
 * Full or selected-ticket refund. Amounts are integer kopecks.
 * Online CARD_ONLINE on staging is settled locally — never calls ЮKassa.
 */
export async function initiateRefund(params: {
  orderNumber: string;
  actorId: string;
  actorRole: RefundActorRole;
  reason: string;
  ticketPublicIds?: string[];
  allowUsedTickets?: boolean;
  idempotencyKey?: string | null;
  ip?: string | null;
  ua?: string | null;
}) {
  if (params.actorRole === "CASHIER") {
    throw new DomainError("FORBIDDEN", "Кассир не может оформить возврат");
  }

  const allowUsed = params.allowUsedTickets === true && params.actorRole === "OWNER";

  if (params.idempotencyKey) {
    const existing = await prisma.refund.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      const order = await prisma.order.findUnique({ where: { id: existing.orderId } });
      return {
        refund: existing,
        orderStatus: order?.status ?? "PAID",
        provider: "idempotent" as const,
      };
    }
  }

  const order = await prisma.order.findUnique({
    where: { number: params.orderNumber },
    include: {
      tickets: { include: { orderItem: true } },
      refunds: { include: { tickets: true } },
      payments: {
        where: { status: { in: ["SUCCEEDED", "REFUNDED"] } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!order) throw new DomainError("ORDER_NOT_FOUND", "Заказ не найден");
  if (order.status !== "PAID") {
    throw new DomainError("ORDER_NOT_PAID", "Возврат доступен только для оплаченных заказов");
  }

  const alreadyRefunded = order.refunds
    .filter((r) => isSuccessfulRefundStatus(r.status))
    .reduce((s, r) => s + r.amount, 0);
  if (alreadyRefunded >= order.totalAmount) {
    throw new DomainError("REFUND_AMOUNT_INVALID", "Заказ уже возвращён");
  }

  const pending = order.refunds.find((r) => r.status === "PENDING");
  if (pending) {
    return { refund: pending, orderStatus: order.status, provider: "pending" as const };
  }

  const refundedTicketIds = new Set(
    order.refunds
      .filter((r) => isSuccessfulRefundStatus(r.status))
      .flatMap((r) => r.tickets.map((row) => row.ticketId)),
  );

  let selected = order.tickets.filter((ticket) => !refundedTicketIds.has(ticket.id));
  if (params.ticketPublicIds && params.ticketPublicIds.length > 0) {
    const wanted = new Set(params.ticketPublicIds);
    selected = order.tickets.filter((ticket) => wanted.has(ticket.publicId));
    if (selected.length !== wanted.size) {
      throw new DomainError("REFUND_NOT_ALLOWED", "Выбран неизвестный билет этого заказа");
    }
  }
  if (selected.length === 0) {
    throw new DomainError("REFUND_AMOUNT_INVALID", "Нет билетов для возврата");
  }

  assertTicketsRefundable({ tickets: selected, allowUsed });

  const amount = refundAmountForTickets(
    selected.map((ticket) => ({
      status: ticket.status,
      unitPriceAmount: ticket.orderItem.unitPriceAmount,
    })),
  );
  if (amount <= 0 || !Number.isInteger(amount)) {
    throw new DomainError("REFUND_AMOUNT_INVALID", "Сумма возврата должна быть целыми копейками");
  }
  if (alreadyRefunded + amount > order.totalAmount) {
    throw new DomainError("REFUND_AMOUNT_INVALID", "Сумма возврата больше оплаченного");
  }

  const payment = order.payments.find((p) => p.status === "SUCCEEDED") ?? order.payments[0];
  if (!payment) {
    throw new DomainError("ORDER_NOT_PAID", "Нет успешного платежа для возврата");
  }

  const local = shouldRefundLocally({
    appEnv: env.APP_ENV,
    paymentMethod: payment.method,
    paymentProvider: payment.provider,
  });

  if (!local && payment.method === "CARD_ONLINE") {
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
        idempotencyKey: params.idempotencyKey ?? undefined,
        tickets: {
          create: selected.map((ticket) => ({
            ticketId: ticket.id,
            amount: ticket.orderItem.unitPriceAmount,
          })),
        },
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
        ticketIds: selected.map((t) => t.id),
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

  const refundRow = await prisma.refund.create({
    data: {
      orderId: order.id,
      paymentId: payment.id,
      amount,
      status: "PENDING",
      reason: params.reason,
      actorId: params.actorId,
      providerRefundId: `local-${randomUUID()}`,
      idempotencyKey: params.idempotencyKey ?? undefined,
      tickets: {
        create: selected.map((ticket) => ({
          ticketId: ticket.id,
          amount: ticket.orderItem.unitPriceAmount,
        })),
      },
    },
  });

  return finalizeSuccessfulRefund({
    refundId: refundRow.id,
    orderId: order.id,
    paymentId: payment.id,
    ticketIds: selected.map((t) => t.id),
    amount,
    actorId: params.actorId,
    providerRefundId: refundRow.providerRefundId,
    reason: params.reason,
    ip: params.ip,
    ua: params.ua,
    cashShiftId: order.shiftId,
  });
}

/** Back-compat for existing e2e: full remaining refund. */
export async function initiateFullRefund(params: {
  orderNumber: string;
  actorId: string;
  reason: string;
  ip?: string | null;
  ua?: string | null;
}) {
  return initiateRefund({
    ...params,
    actorRole: "DIRECTOR",
  });
}

async function finalizeSuccessfulRefund(params: {
  refundId: string;
  orderId: string;
  paymentId: string;
  ticketIds: string[];
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

    await tx.ticket.updateMany({
      where: { id: { in: params.ticketIds }, status: { in: ["VALID", "USED"] } },
      data: { status: "REFUNDED" },
    });

    const remaining = await tx.ticket.count({
      where: { orderId: params.orderId, status: { in: ["VALID", "USED"] } },
    });

    const orderStatus = remaining === 0 ? "REFUNDED" : "PAID";
    await tx.order.update({
      where: { id: params.orderId },
      data: { status: orderStatus },
    });

    if (remaining === 0) {
      await tx.payment.update({
        where: { id: params.paymentId },
        data: { status: "REFUNDED" },
      });
    }

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
        ticketCount: params.ticketIds.length,
        orderStatus,
      },
      ipAddress: params.ip,
      userAgent: params.ua,
    });

    return { refund, orderStatus };
  });

  return {
    refund: result.refund,
    orderStatus: result.orderStatus,
    provider: "local_or_yookassa" as const,
  };
}
