import { Prisma } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import { DomainError } from "@/server/domain/errors";
import { assertCapacity } from "@/server/domain/availability.domain";
import { assertSessionSellableAtCashier } from "@/server/domain/session.domain";
import {
  assertIdempotencyPayloadMatches,
  hashIdempotencyPayload,
} from "@/server/domain/idempotency.domain";
import { computeOrderTotal, generateOrderNumber } from "@/server/domain/order.domain";
import { sumRequestedQuantity } from "@/server/domain/reservation.domain";
import { sessionRepository } from "@/server/repositories/session.repository";
import { orderRepository } from "@/server/repositories/order.repository";
import { expireStaleReservations } from "@/server/services/reservation-cleanup";
import { expireStalePaymentOrders } from "@/server/services/order-cleanup";
import { getSessionAvailability } from "@/server/services/availability";
import { findTicketTypeByCode, resolveTicketPrice } from "@/server/services/pricing";
import { issueTicketsForOrder } from "@/server/services/tickets";
import { recordSaleOnShift, requireOpenShift } from "@/server/services/cashier-shifts";
import type { CashierSaleInput } from "@/lib/validation/cashier";

import { ApiError } from "@/lib/api/response";
import { terminalForLocation } from "@/server/services/evotor-checkout";
import { prepareEvotorReceipt } from "@/server/services/evotor-receipt";

function isRetryable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2002")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cashier walk-up sale — reuses Session capacity + Pricing domain, creates a
 * pending Order with source=CASHIER for Evotor payments. Only fiscal proof
 * records paid totals. Does not alter the online reservation flow.
 */
export async function createCashierSale(
  input: CashierSaleInput,
  cashierId: string,
  idempotencyKey?: string,
) {
  if (input.paymentMethod !== "CASH" && input.paymentMethod !== "CARD_TERMINAL") {
    throw new ApiError("VALIDATION_ERROR", "Онлайн-оплату подтверждает платёжный сервис", 400);
  }
  if (idempotencyKey) {
    const existing = await orderRepository.findByIdempotencyKey(prisma, idempotencyKey);
    if (existing) {
      if (existing.cashierId !== cashierId) throw new ApiError("FORBIDDEN", "Заказ другого кассира", 403);
      assertIdempotencyPayloadMatches(existing.idempotencyPayloadHash, input);
      return existing;
    }
  }

  for (let attempt = 1; attempt <= DOMAIN_CONFIG.maxSerializationRetries; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => createCashierSaleInTransaction(tx, input, cashierId, idempotencyKey),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isRetryable(error) && attempt < DOMAIN_CONFIG.maxSerializationRetries) {
        await sleep(DOMAIN_CONFIG.serializationRetryBaseDelayMs * attempt);
        continue;
      }
      throw error;
    }
  }

  throw new DomainError("SESSION_NOT_FOUND", "Не удалось оформить продажу");
}

async function createCashierSaleInTransaction(
  tx: DbClient,
  input: CashierSaleInput,
  cashierId: string,
  idempotencyKey: string | undefined,
) {
  if (idempotencyKey) {
    const existing = await orderRepository.findByIdempotencyKey(tx, idempotencyKey);
    if (existing) {
      if (existing.cashierId !== cashierId) throw new ApiError("FORBIDDEN", "Заказ другого кассира", 403);
      assertIdempotencyPayloadMatches(existing.idempotencyPayloadHash, input);
      return existing;
    }
  }
  const now = new Date();
  await Promise.all([expireStaleReservations(tx, now), expireStalePaymentOrders(tx, now)]);

  const session = await sessionRepository.findByPublicId(tx, input.sessionPublicId);
  assertSessionSellableAtCashier(session, new Date());
  await sessionRepository.lockForUpdate(tx, session.id);

  const shift = await requireOpenShift(tx, cashierId, session.locationId);
  await tx.$queryRaw`SELECT id FROM "CashierShift" WHERE id = ${shift.id} FOR UPDATE`;
  await requireOpenShift(tx, cashierId, session.locationId);

  const requestedItems = input.items.filter((item) => item.quantity > 0);
  const totalRequested = sumRequestedQuantity(requestedItems);
  const availability = await getSessionAvailability(tx, session.id, now);
  assertCapacity(availability, totalRequested);

  const lineItems = await Promise.all(
    requestedItems.map(async (item) => {
      const ticketType = await findTicketTypeByCode(tx, item.ticketTypeCode).catch((error) => {
        if (error instanceof DomainError && error.code === "TICKET_TYPE_NOT_FOUND") {
          throw new DomainError(
            "INVALID_TICKET_TYPE",
            `Неизвестный тип билета «${item.ticketTypeCode}»`,
          );
        }
        throw error;
      });
      const price = await resolveTicketPrice(tx, {
        locationId: session.locationId,
        ticketTypeId: ticketType.id,
        timezone: session.location.timezone,
        atDate: session.startsAt,
      });
      return {
        code: ticketType.code,
        ticketTypeId: price.ticketTypeId,
        ticketTypeName: price.ticketTypeName,
        quantity: item.quantity,
        unitPriceAmount: price.unitPriceAmount,
        subtotalAmount: item.quantity * price.unitPriceAmount,
      };
    }),
  );

  const totalAmount = computeOrderTotal(lineItems);
  assertSessionSellableAtCashier(session, new Date());
  const terminal = input.paymentMethod === "CARD_ONLINE" ? null : terminalForLocation(session.locationId);
  if (input.paymentMethod !== "CARD_ONLINE" && !terminal) {
    throw new ApiError("NOT_CONFIGURED", "Для этой локации не настроен Эвотор", 503);
  }
  if (terminal && !idempotencyKey) throw new ApiError("VALIDATION_ERROR", "Требуется идентификатор операции", 400);
  if (input.paymentMethod === "CASH" && (input.cashReceived === undefined || input.cashReceived < totalAmount)) {
    throw new ApiError("VALIDATION_ERROR", "Укажите полученную сумму не меньше суммы заказа", 400);
  }
  const receiptPayload = prepareEvotorReceipt({ totalAmount, items: lineItems });
  const order = await orderRepository.createCashierPaid(tx, {
    number: generateOrderNumber(),
    sessionId: session.id,
    locationId: session.locationId,
    cashierId,
    shiftId: shift.id,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    totalAmount,
    paymentMethod: input.paymentMethod,
    awaitingFiscalization: Boolean(terminal),
    idempotencyKey,
    idempotencyPayloadHash: idempotencyKey ? hashIdempotencyPayload(input) : undefined,
    items: lineItems,
  });

  if (terminal) {
    await tx.evotorCheckout.create({ data: {
      orderId: order.id, terminalId: terminal.id,
      receiptPayload,
      cashReceived: input.paymentMethod === "CASH" ? input.cashReceived : null,
      changeAmount: input.paymentMethod === "CASH" ? input.cashReceived! - totalAmount : null,
    }});
    return order;
  }

  const ticketsCount = lineItems.reduce((sum, i) => sum + i.quantity, 0);
  await recordSaleOnShift(tx, {
    shiftId: shift.id,
    orderId: order.id,
    userId: cashierId,
    paymentMethod: input.paymentMethod,
    amount: totalAmount,
    ticketsCount,
  });

  await recordAuditLog(tx, {
    actorId: cashierId,
    action: "CASHIER_SALE_CREATED",
    entityType: "Order",
    entityId: order.id,
    metadata: {
      paymentMethod: input.paymentMethod,
      totalAmount,
      sessionId: session.id,
      shiftId: shift.id,
    },
  });

  await issueTicketsForOrder(order.id, tx);

  return order;
}
