import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import {
  buildReservationLineItems,
  computeReservationExpiry,
  isReservationActive,
  isReservationExpired,
  sumRequestedQuantity,
} from "@/server/domain/reservation.domain";
import { DomainError } from "@/server/domain/errors";
import type { ResolvedPrice } from "@/server/domain/pricing.domain";

test("computeReservationExpiry adds the configured hold duration", () => {
  const now = new Date("2026-07-25T10:00:00.000Z");
  const expiresAt = computeReservationExpiry(now);
  const diffMinutes = (expiresAt.getTime() - now.getTime()) / (60 * 1000);
  assert.equal(diffMinutes, DOMAIN_CONFIG.reservationHoldMinutes);
});

test("isReservationExpired reflects whether `expiresAt` is in the past", () => {
  const now = new Date("2026-07-25T10:00:00.000Z");
  assert.equal(isReservationExpired({ expiresAt: new Date("2026-07-25T09:59:59.000Z") }, now), true);
  assert.equal(isReservationExpired({ expiresAt: new Date("2026-07-25T10:00:01.000Z") }, now), false);
});

test("isReservationActive requires PENDING status AND a future expiresAt", () => {
  const now = new Date("2026-07-25T10:00:00.000Z");
  assert.equal(
    isReservationActive({ status: "PENDING", expiresAt: new Date("2026-07-25T10:05:00.000Z") }, now),
    true,
  );
  assert.equal(
    isReservationActive({ status: "PENDING", expiresAt: new Date("2026-07-25T09:00:00.000Z") }, now),
    false,
  );
  assert.equal(
    isReservationActive({ status: "CONFIRMED", expiresAt: new Date("2026-07-25T10:05:00.000Z") }, now),
    false,
  );
});

test("buildReservationLineItems drops zero-quantity items and snapshots the resolved price", () => {
  const priced: ResolvedPrice[] = [
    {
      ticketTypeId: "tt-adult",
      ticketTypeCode: "ADULT",
      ticketTypeName: "Взрослый",
      unitPriceAmount: 80000,
      dayType: "WEEKDAY",
    },
    {
      ticketTypeId: "tt-child",
      ticketTypeCode: "CHILD",
      ticketTypeName: "Детский",
      unitPriceAmount: 60000,
      dayType: "WEEKDAY",
    },
  ];

  const items = buildReservationLineItems(
    [
      { ticketTypeCode: "ADULT", quantity: 2 },
      { ticketTypeCode: "CHILD", quantity: 0 },
    ],
    priced,
  );

  assert.equal(items.length, 1);
  assert.deepEqual(items[0], { ticketTypeId: "tt-adult", quantity: 2, unitPriceAmount: 80000 });
});

test("buildReservationLineItems throws when a requested ticket type has no resolved price", () => {
  assert.throws(
    () => buildReservationLineItems([{ ticketTypeCode: "ADULT", quantity: 1 }], []),
    (error: unknown) => error instanceof DomainError && error.code === "TICKET_TYPE_NOT_FOUND",
  );
});

test("sumRequestedQuantity adds up every line item's quantity", () => {
  assert.equal(sumRequestedQuantity([{ quantity: 2 }, { quantity: 1 }, { quantity: 0 }]), 3);
});
