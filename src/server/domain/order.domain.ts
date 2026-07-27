import { randomUUID } from "node:crypto";
import type { Reservation, ReservationItem, TicketType } from "@prisma/client";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import { DomainError } from "@/server/domain/errors";
import { isReservationExpired } from "@/server/domain/reservation.domain";

export interface OrderLineItemInput {
  ticketTypeId: string;
  ticketTypeName: string;
  quantity: number;
  unitPriceAmount: number;
  subtotalAmount: number;
}

/**
 * OrderDomain — pure rules for converting a held Reservation into an Order:
 * eligibility checks, price-snapshot line items (reusing the price already
 * quoted at reservation time — never re-priced at order time), order
 * number generation, and the order's own payment deadline. No I/O.
 */

/** Generates a random, non-guessable, customer-safe order number (e.g. "LP-A1B2C3D4"). */
export function generateOrderNumber(): string {
  const suffix = randomUUID()
    .replace(/-/g, "")
    .slice(0, DOMAIN_CONFIG.orderNumberRandomLength)
    .toUpperCase();
  return `${DOMAIN_CONFIG.orderNumberPrefix}-${suffix}`;
}

/**
 * An AWAITING_PAYMENT order keeps occupying seats only until this deadline —
 * independent from the originating Reservation's `expiresAt`, which stops
 * mattering the moment the order exists.
 */
export function computeOrderPaymentExpiry(now: Date): Date {
  return new Date(now.getTime() + DOMAIN_CONFIG.orderPaymentWindowMinutes * 60 * 1000);
}

/**
 * A reservation can become an order only while it is still an active hold
 * (status PENDING and not expired). Whether it already has an order is
 * checked separately by the caller (see OrderService), so it can decide to
 * gracefully return the existing order instead of failing.
 *
 * Generic over `T` so the caller's richer reservation shape (e.g. with
 * `items` included) is preserved after the assertion, instead of
 * collapsing to the minimal shape used for the check itself.
 */
export function assertReservationHoldActive<T extends Reservation>(
  reservation: T | null,
  now: Date,
): asserts reservation is T {
  if (!reservation) {
    throw new DomainError("RESERVATION_NOT_FOUND", "Резервирование не найдено");
  }
  if (reservation.status === "EXPIRED" || isReservationExpired(reservation, now)) {
    throw new DomainError(
      "RESERVATION_EXPIRED",
      "Время бронирования истекло, выберите сеанс ещё раз",
    );
  }
  if (reservation.status !== "PENDING") {
    throw new DomainError(
      "RESERVATION_EXPIRED",
      "Это резервирование больше не активно, выберите сеанс ещё раз",
    );
  }
}

/**
 * Builds Order line items directly from the Reservation's own line items,
 * reusing their `unitPriceAmount` snapshot (quoted at hold time) instead of
 * re-resolving prices — the customer pays exactly what they were quoted.
 */
export function buildOrderLineItems(
  reservationItems: ReservationItem[],
  ticketTypesById: Map<string, TicketType>,
): OrderLineItemInput[] {
  return reservationItems.map((item) => {
    const ticketType = ticketTypesById.get(item.ticketTypeId);
    if (!ticketType) {
      throw new DomainError(
        "TICKET_TYPE_NOT_FOUND",
        "Тип билета из резервирования больше не существует",
      );
    }
    return {
      ticketTypeId: item.ticketTypeId,
      ticketTypeName: ticketType.name,
      quantity: item.quantity,
      unitPriceAmount: item.unitPriceAmount,
      subtotalAmount: item.quantity * item.unitPriceAmount,
    };
  });
}

export function computeOrderTotal(items: OrderLineItemInput[]): number {
  return items.reduce((sum, item) => sum + item.subtotalAmount, 0);
}
