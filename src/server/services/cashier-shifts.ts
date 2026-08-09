import { prisma, type DbClient } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { DomainError } from "@/server/domain/errors";
import {
  cashDifferenceKopecks,
  expectedCashKopecks,
} from "@/server/domain/shift.domain";
import type { CashOperationType, PaymentMethod } from "@prisma/client";

export async function getOpenShiftForCashier(
  db: DbClient,
  userId: string,
  locationId?: string,
) {
  return db.cashierShift.findFirst({
    where: {
      userId,
      status: "OPEN",
      ...(locationId ? { locationId } : {}),
    },
    include: {
      location: { select: { id: true, name: true, city: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { openedAt: "desc" },
  });
}

export async function requireOpenShift(db: DbClient, userId: string, locationId: string) {
  const shift = await getOpenShiftForCashier(db, userId, locationId);
  if (!shift) {
    throw new DomainError("SHIFT_NOT_OPEN", "Откройте смену перед продажей");
  }
  return shift;
}

export async function openCashierShift(params: {
  userId: string;
  locationId: string;
  openingCashAmount: number;
  notes?: string | null;
  ip?: string | null;
  ua?: string | null;
}) {
  const existing = await getOpenShiftForCashier(prisma, params.userId, params.locationId);
  if (existing) {
    throw new DomainError("SHIFT_ALREADY_OPEN", "Уже есть открытая смена в этой локации");
  }

  // Also block second OPEN shift for same cashier at any location.
  const anyOpen = await getOpenShiftForCashier(prisma, params.userId);
  if (anyOpen) {
    throw new DomainError("SHIFT_ALREADY_OPEN", "Уже есть открытая смена");
  }

  const shift = await prisma.$transaction(async (tx) => {
    const created = await tx.cashierShift.create({
      data: {
        userId: params.userId,
        locationId: params.locationId,
        openingCashAmount: params.openingCashAmount,
        notes: params.notes ?? null,
        status: "OPEN",
      },
      include: {
        location: { select: { id: true, name: true, city: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await tx.cashOperation.create({
      data: {
        shiftId: created.id,
        userId: params.userId,
        type: "OPENING",
        amount: params.openingCashAmount,
        comment: params.notes ?? "Открытие смены",
      },
    });

    await recordAuditLog(tx, {
      actorId: params.userId,
      action: "SHIFT_OPEN",
      entityType: "CashierShift",
      entityId: created.id,
      after: {
        locationId: created.locationId,
        openingCashAmount: created.openingCashAmount,
      },
      ipAddress: params.ip,
      userAgent: params.ua,
    });

    return created;
  });

  return shift;
}

export async function addCashOperation(params: {
  userId: string;
  type: Extract<CashOperationType, "IN" | "OUT" | "ADJUSTMENT">;
  amount: number;
  comment: string;
  ip?: string | null;
  ua?: string | null;
}) {
  if (params.amount <= 0) {
    throw new DomainError("REFUND_AMOUNT_INVALID", "Сумма должна быть больше 0");
  }
  if (!params.comment.trim()) {
    throw new DomainError("FORBIDDEN", "Комментарий обязателен");
  }

  const shift = await getOpenShiftForCashier(prisma, params.userId);
  if (!shift) throw new DomainError("SHIFT_NOT_OPEN", "Нет открытой смены");

  const op = await prisma.$transaction(async (tx) => {
    const row = await tx.cashOperation.create({
      data: {
        shiftId: shift.id,
        userId: params.userId,
        type: params.type,
        amount: params.amount,
        comment: params.comment.trim(),
      },
    });

    await recordAuditLog(tx, {
      actorId: params.userId,
      action: `CASH_${params.type}`,
      entityType: "CashOperation",
      entityId: row.id,
      metadata: { shiftId: shift.id, amount: params.amount, comment: params.comment },
      ipAddress: params.ip,
      userAgent: params.ua,
    });

    return row;
  });

  return { operation: op, shiftId: shift.id };
}

export async function recordSaleOnShift(
  db: DbClient,
  params: {
    shiftId: string;
    orderId: string;
    userId: string;
    paymentMethod: PaymentMethod;
    amount: number;
    ticketsCount: number;
  },
) {
  const salesField =
    params.paymentMethod === "CASH"
      ? "cashSalesAmount"
      : params.paymentMethod === "CARD_TERMINAL"
        ? "cardSalesAmount"
        : "onlineSalesAmount";

  await db.cashierShift.update({
    where: { id: params.shiftId },
    data: {
      [salesField]: { increment: params.amount },
      ordersCount: { increment: 1 },
      ticketsCount: { increment: params.ticketsCount },
    },
  });

  if (params.paymentMethod === "CASH") {
    await db.cashOperation.create({
      data: {
        shiftId: params.shiftId,
        userId: params.userId,
        type: "SALE",
        amount: params.amount,
        orderId: params.orderId,
        comment: "Продажа наличными",
      },
    });
  }
}

export async function computeShiftCashSummary(shiftId: string) {
  const shift = await prisma.cashierShift.findUniqueOrThrow({
    where: { id: shiftId },
    include: {
      cashOperations: true,
      orders: {
        include: {
          refunds: { where: { status: { in: ["COMPLETED", "SUCCEEDED"] } } },
          payments: true,
        },
      },
    },
  });

  const cashIn = shift.cashOperations
    .filter((o) => o.type === "IN")
    .reduce((s, o) => s + o.amount, 0);
  const cashOut = shift.cashOperations
    .filter((o) => o.type === "OUT")
    .reduce((s, o) => s + o.amount, 0);

  const cashRefunds = shift.orders.reduce((sum, order) => {
    const cashPaid = order.payments.some((p) => p.method === "CASH" && p.status === "SUCCEEDED");
    if (!cashPaid) return sum;
    return sum + order.refunds.reduce((r, ref) => r + ref.amount, 0);
  }, 0);

  const expected = expectedCashKopecks({
    openingCashAmount: shift.openingCashAmount,
    cashSalesAmount: shift.cashSalesAmount,
    cashRefundsAmount: cashRefunds,
    cashInAmount: cashIn,
    cashOutAmount: cashOut,
  });

  return {
    shift,
    cashIn,
    cashOut,
    cashRefunds,
    expectedCashAmount: expected,
    refundsCount: shift.orders.reduce((n, o) => n + o.refunds.length, 0),
  };
}

export async function closeCashierShift(params: {
  userId: string;
  shiftId: string;
  closingCashAmount: number;
  notes?: string | null;
  force?: boolean;
  actorId?: string;
  reason?: string | null;
  ip?: string | null;
  ua?: string | null;
}) {
  const summary = await computeShiftCashSummary(params.shiftId);
  const shift = summary.shift;

  if (shift.status !== "OPEN") {
    throw new DomainError("SHIFT_ALREADY_CLOSED", "Смена уже закрыта");
  }
  if (!params.force && shift.userId !== params.userId) {
    throw new DomainError("FORBIDDEN", "Можно закрыть только свою смену");
  }

  const diff = cashDifferenceKopecks(params.closingCashAmount, summary.expectedCashAmount);
  if (diff !== 0 && !params.notes?.trim() && !params.reason?.trim()) {
    throw new DomainError("FORBIDDEN", "При расхождении нужен комментарий");
  }

  const closed = await prisma.$transaction(async (tx) => {
    const updated = await tx.cashierShift.update({
      where: { id: shift.id },
      data: {
        status: params.force ? "FORCE_CLOSED" : "CLOSED",
        closedAt: new Date(),
        closingCashAmount: params.closingCashAmount,
        expectedCashAmount: summary.expectedCashAmount,
        cashDifferenceAmount: diff,
        cashRefundsAmount: summary.cashRefunds,
        notes: params.notes ?? shift.notes,
        closeReason: params.reason ?? null,
      },
      include: {
        location: { select: { id: true, name: true, city: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await tx.cashOperation.create({
      data: {
        shiftId: shift.id,
        userId: params.actorId ?? params.userId,
        type: "CLOSING",
        amount: params.closingCashAmount,
        comment: params.notes ?? params.reason ?? "Закрытие смены",
      },
    });

    await recordAuditLog(tx, {
      actorId: params.actorId ?? params.userId,
      action: params.force ? "SHIFT_FORCE_CLOSE" : "SHIFT_CLOSE",
      entityType: "CashierShift",
      entityId: shift.id,
      after: {
        closingCashAmount: params.closingCashAmount,
        expectedCashAmount: summary.expectedCashAmount,
        cashDifferenceAmount: diff,
        reason: params.reason,
      },
      ipAddress: params.ip,
      userAgent: params.ua,
    });

    return updated;
  });

  return {
    shift: closed,
    summary: {
      ...summary,
      cashDifferenceAmount: diff,
      closingCashAmount: params.closingCashAmount,
    },
  };
}
