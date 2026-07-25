import { Prisma, type Order, type OrderItem } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { DomainError } from "@/server/domain/errors";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import {
  assertReservationConvertible,
  buildOrderLineItems,
  computeOrderTotal,
  generateOrderNumber,
} from "@/server/domain/order.domain";
import { reservationRepository } from "@/server/repositories/reservation.repository";
import { orderRepository } from "@/server/repositories/order.repository";
import { ticketTypeRepository } from "@/server/repositories/ticket-type.repository";
import { expireStaleReservations } from "@/server/services/reservation-cleanup";
import type { CreateOrderInput } from "@/lib/validation/order";

export type OrderWithItems = Order & { items: OrderItem[] };

function isOrderNumberConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    (error.meta.target as string[]).includes("number")
  );
}

/**
 * OrderService — orchestrates Domain (reservation → order eligibility,
 * price-snapshot line items, order number) and Repository (data access) to
 * convert a held Reservation into an Order.
 *
 * The customer never sends a price, amount, status or line items — only
 * `reservationId` + contact details. Everything financial is derived
 * server-side from the Reservation's own (already server-priced) items.
 *
 * If `idempotencyKey` is supplied and an order already exists for it, that
 * existing order is returned instead of creating a duplicate.
 */
export async function createOrder(input: CreateOrderInput): Promise<OrderWithItems> {
  if (input.idempotencyKey) {
    const existing = await orderRepository.findByIdempotencyKey(prisma, input.idempotencyKey);
    if (existing) {
      return existing;
    }
  }

  for (let attempt = 1; attempt <= DOMAIN_CONFIG.maxOrderNumberRetries; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => createOrderInTransaction(tx, input));
    } catch (error) {
      const isLastAttempt = attempt === DOMAIN_CONFIG.maxOrderNumberRetries;
      if (isOrderNumberConflict(error) && !isLastAttempt) {
        continue;
      }
      throw error;
    }
  }

  // Unreachable — the loop above always returns or throws.
  throw new DomainError("ORDER_NOT_FOUND", "Не удалось создать заказ");
}

async function createOrderInTransaction(
  tx: DbClient,
  input: CreateOrderInput,
): Promise<OrderWithItems> {
  const now = new Date();

  // A reservation whose hold just expired must never convert into an order.
  await expireStaleReservations(tx, now);

  const reservation = await reservationRepository.findByPublicIdWithOrderFlag(
    tx,
    input.reservationId,
  );
  assertReservationConvertible(reservation, now);

  const ticketTypes = await ticketTypeRepository.findManyByIds(
    tx,
    reservation.items.map((item) => item.ticketTypeId),
  );
  const ticketTypesById = new Map(ticketTypes.map((ticketType) => [ticketType.id, ticketType]));

  const lineItems = buildOrderLineItems(reservation.items, ticketTypesById);
  const totalAmount = computeOrderTotal(lineItems);
  const number = generateOrderNumber();

  const order = await orderRepository.create(tx, {
    number,
    sessionId: reservation.sessionId,
    reservationId: reservation.id,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    totalAmount,
    idempotencyKey: input.idempotencyKey,
    items: lineItems,
  });

  await reservationRepository.markConfirmed(tx, reservation.id);

  await recordAuditLog(tx, {
    action: "ORDER_CREATED",
    entityType: "Order",
    entityId: order.id,
    metadata: { reservationId: reservation.id, totalAmount },
  });

  return order;
}

/** Looks up an order by its public-safe, non-guessable `number`. */
export async function getOrderByNumber(number: string): Promise<OrderWithItems | null> {
  return orderRepository.findByNumber(prisma, number);
}
