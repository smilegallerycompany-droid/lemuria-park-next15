import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAvailability, assertCapacity } from "@/server/domain/availability.domain";
import { DomainError } from "@/server/domain/errors";

test("computeAvailability sums reserved + ordered seats against capacity", () => {
  const availability = computeAvailability({
    sessionId: "session-1",
    capacity: 15,
    reservedQuantity: 4,
    orderedQuantity: 9,
  });
  assert.equal(availability.booked, 13);
  assert.equal(availability.available, 2);
});

test("computeAvailability never returns a negative `available`", () => {
  const availability = computeAvailability({
    sessionId: "session-1",
    capacity: 15,
    reservedQuantity: 10,
    orderedQuantity: 10,
  });
  assert.equal(availability.available, 0);
});

test("assertCapacity throws INSUFFICIENT_CAPACITY when requesting more than available", () => {
  const availability = computeAvailability({
    sessionId: "session-1",
    capacity: 15,
    reservedQuantity: 13,
    orderedQuantity: 0,
  });
  assert.equal(availability.available, 2);

  assert.throws(
    () => assertCapacity(availability, 3),
    (error: unknown) => error instanceof DomainError && error.code === "INSUFFICIENT_CAPACITY",
  );
});

test("assertCapacity allows requesting exactly the remaining seats", () => {
  const availability = computeAvailability({
    sessionId: "session-1",
    capacity: 15,
    reservedQuantity: 13,
    orderedQuantity: 0,
  });
  assert.doesNotThrow(() => assertCapacity(availability, 2));
});
