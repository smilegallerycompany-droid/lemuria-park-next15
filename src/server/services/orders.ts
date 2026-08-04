import { Prisma, type Order, type OrderItem } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { DomainError } from "@/server/domain/errors";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import {
  assertReservationHoldActive,
  buildOrderLineItems,
  computeOrderPaymentExpiry,
  computeOrderTotal,
  generateOrderNumber,
} from "@/server/domain/order.domain";
import {
  assertIdempotencyPayloadMatches,
  hashIdempotencyPayload,
} from "@/server/domain/idempotency.domain";
import { reservationRepository } from "@/server/repositories/reservation.repository";
import { orderRepository } from "@/server/repositories/order.repository";
import { ticketTypeRepository } from "@/server/repositories/ticket-type.repository";
import { expireStaleReservations } from "@/server/services/reservation-cleanup";
import type { CreateOrderInput } from "@/lib/validation/order";

export type OrderWithItems = Order & { items: OrderItem[] };

function isRetryableConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true; // Serializable write conflict.
  if (error.code === "P2002" && Array.isArray(error.meta?.target)) {
    const target = error.meta.target as string[];
    // Order number collision (astronomically unlikely) or a race on the
    // one-reservation-to-one-order unique constraint — both are safe to retry:
    // a retry will either mint a fresh number or discover the now-existing order.
    return target.includes("number") || target.includes("reservationId");
  }
  return false;
}

function retryDelayMs(attempt: number): number {
  return DOMAIN_CONFIG.serializationRetryBaseDelayMs * attempt + Math.floor(Math.random() * 25);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * OrderService — orchestrates Domain (reservation → order eligibility,
 * price-snapshot line items, order number, payment deadline) and
 * Repository (data access) to convert a held Reservation into an Order.
 *
 * The customer never sends a price, amount, status or line items — only
 * `reservationPublicId` + contact details. Everything financial is derived
 * server-side from the Reservation's own (already server-priced) items.
 *
 * Idempotency: a repeated `idempotencyKey` with the same payload returns
 * the existing order; with a different payload it raises
 * `IDEMPOTENCY_CONFLICT`. A converted Reservation always resolves to its
 * one-and-only Order (enforced by the DB's unique `reservationId`) — never
 * a second one, regardless of the key used.
 */
export async function createOrder(
  input: CreateOrderInput,
  idempotencyKey?: string,
): Promise<OrderWithItems> {
  if (idempotencyKey) {
    const existing = await orderRepository.findByIdempotencyKey(prisma, idempotencyKey);
    if (existing) {
      assertIdempotencyPayloadMatches(existing.idempotencyPayloadHash, input);
      return existing;
    }
  }

  for (let attempt = 1; attempt <= DOMAIN_CONFIG.maxOrderNumberRetries; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => createOrderInTransaction(tx, input, idempotencyKey),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const isLastAttempt = attempt === DOMAIN_CONFIG.maxOrderNumberRetries;
      if (isRetryableConflict(error) && !isLastAttempt) {
        await sleep(retryDelayMs(attempt));
        continue;
      }
      throw error;
    }
  }

  // Unreachable — the loop above always returns or throws.
  throw new DomainError("RESERVATION_NOT_FOUND", "Не удалось создать заказ");
}

async function createOrderInTransaction(
  tx: DbClient,
  input: CreateOrderInput,
  idempotencyKey: string | undefined,
): Promise<OrderWithItems> {
  const now = new Date();

  // A reservation whose hold just expired must never convert into an order.
  await expireStaleReservations(tx, now);

  const reservation = await reservationRepository.findByPublicId(tx, input.reservationPublicId);
  if (!reservation) {
    throw new DomainError("RESERVATION_NOT_FOUND", "Резервирование не найдено");
  }

  // Lock the reservation row for the duration of this transaction so two
  // concurrent order-creation attempts for the same reservation can never
  // both proceed to insert — one will see the lock, the other the DB's
  // unique `reservationId` constraint.
  await reservationRepository.lockForUpdate(tx, reservation.id);

  // Already converted — idempotently hand back the one-and-only Order for
  // this reservation instead of failing or creating a second one. Re-checked
  // (rather than trusting the pre-lock `reservation.order` flag) so this is
  // correct even if another transaction converted it between our initial
  // read and acquiring the lock.
  const existingOrder = await orderRepository.findByReservationId(tx, reservation.id);
  if (existingOrder) {
    return existingOrder;
  }

  assertReservationHoldActive(reservation, now);

  const ticketTypes = await ticketTypeRepository.findManyByIds(
    tx,
    reservation.items.map((item) => item.ticketTypeId),
  );
  const ticketTypesById = new Map(ticketTypes.map((ticketType) => [ticketType.id, ticketType]));

  const lineItems = buildOrderLineItems(reservation.items, ticketTypesById);
  const totalAmount = computeOrderTotal(lineItems);
  const number = generateOrderNumber();

  const session = await tx.session.findUnique({
    where: { id: reservation.sessionId },
    select: { locationId: true },
  });

  const order = await orderRepository.create(tx, {
    number,
    sessionId: reservation.sessionId,
    locationId: session?.locationId ?? null,
    reservationId: reservation.id,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    totalAmount,
    paymentExpiresAt: computeOrderPaymentExpiry(now),
    idempotencyKey,
    idempotencyPayloadHash: idempotencyKey ? hashIdempotencyPayload(input) : undefined,
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
