import { Prisma } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import { DomainError } from "@/server/domain/errors";
import { assertCapacity } from "@/server/domain/availability.domain";
import { assertSessionBookable } from "@/server/domain/session.domain";
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
import type { CashierSaleInput } from "@/lib/validation/cashier";

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
 * PAID Order with source=CASHIER. Does not alter the online reservation flow.
 */
export async function createCashierSale(
  input: CashierSaleInput,
  cashierId: string,
  idempotencyKey?: string,
) {
  if (idempotencyKey) {
    const existing = await orderRepository.findByIdempotencyKey(prisma, idempotencyKey);
    if (existing) {
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
  const now = new Date();
  await Promise.all([expireStaleReservations(tx, now), expireStalePaymentOrders(tx, now)]);

  const session = await sessionRepository.findByPublicId(tx, input.sessionPublicId);
  assertSessionBookable(session, now);
  await sessionRepository.lockForUpdate(tx, session.id);

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
        ticketTypeId: price.ticketTypeId,
        ticketTypeName: price.ticketTypeName,
        quantity: item.quantity,
        unitPriceAmount: price.unitPriceAmount,
        subtotalAmount: item.quantity * price.unitPriceAmount,
      };
    }),
  );

  const totalAmount = computeOrderTotal(lineItems);
  const order = await orderRepository.createCashierPaid(tx, {
    number: generateOrderNumber(),
    sessionId: session.id,
    cashierId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    totalAmount,
    paymentMethod: input.paymentMethod,
    idempotencyKey,
    idempotencyPayloadHash: idempotencyKey ? hashIdempotencyPayload(input) : undefined,
    items: lineItems,
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
    },
  });

  return order;
}
