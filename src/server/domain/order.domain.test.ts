import { test } from "node:test";
import assert from "node:assert/strict";
import type { Reservation, ReservationItem, TicketType } from "@prisma/client";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import {
  assertReservationHoldActive,
  buildOrderLineItems,
  computeOrderPaymentExpiry,
  computeOrderTotal,
  generateOrderNumber,
} from "@/server/domain/order.domain";
import { DomainError } from "@/server/domain/errors";

function fakeReservation(overrides: Partial<Reservation>): Reservation {
  return {
    id: "reservation-1",
    publicId: "res-public-1",
    sessionId: "session-1",
    status: "PENDING",
    expiresAt: new Date("2026-07-25T12:00:00.000Z"),
    customerName: null,
    customerPhone: null,
    customerEmail: null,
    idempotencyKey: null,
    idempotencyPayloadHash: null,
    createdAt: new Date("2026-07-25T11:45:00.000Z"),
    updatedAt: new Date("2026-07-25T11:45:00.000Z"),
    ...overrides,
  };
}

const NOW = new Date("2026-07-25T11:50:00.000Z");

test("generateOrderNumber produces a public, prefixed, fixed-length order number", () => {
  const number = generateOrderNumber();
  const [prefix, suffix] = number.split("-");
  assert.equal(prefix, DOMAIN_CONFIG.orderNumberPrefix);
  assert.equal(suffix.length, DOMAIN_CONFIG.orderNumberRandomLength);
  assert.match(suffix, /^[0-9A-F]+$/);
});

test("generateOrderNumber is not sequential/guessable across calls", () => {
  const a = generateOrderNumber();
  const b = generateOrderNumber();
  assert.notEqual(a, b);
});

test("computeOrderPaymentExpiry adds the configured payment window to now", () => {
  const expiresAt = computeOrderPaymentExpiry(NOW);
  assert.equal(
    expiresAt.getTime() - NOW.getTime(),
    DOMAIN_CONFIG.orderPaymentWindowMinutes * 60 * 1000,
  );
});

test("assertReservationHoldActive rejects a missing reservation", () => {
  assert.throws(
    () => assertReservationHoldActive(null, NOW),
    (error: unknown) => error instanceof DomainError && error.code === "RESERVATION_NOT_FOUND",
  );
});

test("assertReservationHoldActive rejects an expired reservation, even if status is still PENDING", () => {
  assert.throws(
    () =>
      assertReservationHoldActive(
        fakeReservation({ expiresAt: new Date("2026-07-25T11:00:00.000Z") }),
        NOW,
      ),
    (error: unknown) => error instanceof DomainError && error.code === "RESERVATION_EXPIRED",
  );
});

test("assertReservationHoldActive rejects a non-PENDING reservation", () => {
  assert.throws(
    () => assertReservationHoldActive(fakeReservation({ status: "CANCELLED" }), NOW),
    (error: unknown) => error instanceof DomainError && error.code === "RESERVATION_EXPIRED",
  );
});

test("assertReservationHoldActive accepts an active PENDING reservation", () => {
  assert.doesNotThrow(() => assertReservationHoldActive(fakeReservation({}), NOW));
});

function fakeReservationItem(overrides: Partial<ReservationItem>): ReservationItem {
  return {
    id: "item-1",
    reservationId: "reservation-1",
    ticketTypeId: "tt-adult",
    quantity: 2,
    unitPriceAmount: 80000,
    createdAt: new Date("2026-07-25T11:45:00.000Z"),
    updatedAt: new Date("2026-07-25T11:45:00.000Z"),
    ...overrides,
  };
}

function fakeTicketType(overrides: Partial<TicketType>): TicketType {
  return {
    id: "tt-adult",
    code: "ADULT",
    name: "Взрослый",
    description: null,
    minAge: null,
    maxAge: null,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("buildOrderLineItems reuses the reservation's own price snapshot (never re-prices)", () => {
  const items = buildOrderLineItems(
    [fakeReservationItem({ quantity: 2, unitPriceAmount: 80000 })],
    new Map([["tt-adult", fakeTicketType({})]]),
  );
  assert.deepEqual(items, [
    {
      ticketTypeId: "tt-adult",
      ticketTypeName: "Взрослый",
      quantity: 2,
      unitPriceAmount: 80000,
      subtotalAmount: 160000,
    },
  ]);
});

test("buildOrderLineItems throws if the reservation references an unknown ticket type", () => {
  assert.throws(
    () => buildOrderLineItems([fakeReservationItem({})], new Map()),
    (error: unknown) => error instanceof DomainError && error.code === "TICKET_TYPE_NOT_FOUND",
  );
});

test("computeOrderTotal sums every line item's subtotal", () => {
  const total = computeOrderTotal([
    {
      ticketTypeId: "a",
      ticketTypeName: "A",
      quantity: 2,
      unitPriceAmount: 80000,
      subtotalAmount: 160000,
    },
    {
      ticketTypeId: "b",
      ticketTypeName: "B",
      quantity: 1,
      unitPriceAmount: 60000,
      subtotalAmount: 60000,
    },
  ]);
  assert.equal(total, 220000);
});
