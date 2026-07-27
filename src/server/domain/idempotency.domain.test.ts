import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertIdempotencyPayloadMatches,
  hashIdempotencyPayload,
} from "@/server/domain/idempotency.domain";
import { DomainError } from "@/server/domain/errors";

test("hashIdempotencyPayload is stable regardless of top-level key order", () => {
  const a = hashIdempotencyPayload({
    sessionPublicId: "s1",
    items: [{ ticketTypeCode: "ADULT", quantity: 2 }],
  });
  const b = hashIdempotencyPayload({
    items: [{ ticketTypeCode: "ADULT", quantity: 2 }],
    sessionPublicId: "s1",
  });
  assert.equal(a, b);
});

test("hashIdempotencyPayload is stable regardless of nested object key order", () => {
  const a = hashIdempotencyPayload({ items: [{ ticketTypeCode: "ADULT", quantity: 2 }] });
  const b = hashIdempotencyPayload({ items: [{ quantity: 2, ticketTypeCode: "ADULT" }] });
  assert.equal(a, b);
});

test("hashIdempotencyPayload differs for genuinely different payloads", () => {
  const a = hashIdempotencyPayload({ items: [{ ticketTypeCode: "ADULT", quantity: 2 }] });
  const b = hashIdempotencyPayload({ items: [{ ticketTypeCode: "ADULT", quantity: 3 }] });
  assert.notEqual(a, b);
});

test("assertIdempotencyPayloadMatches is a no-op when no hash is stored yet", () => {
  assert.doesNotThrow(() => assertIdempotencyPayloadMatches(null, { any: "payload" }));
});

test("assertIdempotencyPayloadMatches accepts a payload matching the stored hash", () => {
  const payload = { sessionPublicId: "s1", items: [{ ticketTypeCode: "ADULT", quantity: 2 }] };
  const stored = hashIdempotencyPayload(payload);
  assert.doesNotThrow(() => assertIdempotencyPayloadMatches(stored, payload));
});

test("assertIdempotencyPayloadMatches rejects a payload that differs from the stored hash", () => {
  const stored = hashIdempotencyPayload({ sessionPublicId: "s1", items: [] });
  assert.throws(
    () => assertIdempotencyPayloadMatches(stored, { sessionPublicId: "s2", items: [] }),
    (error: unknown) => error instanceof DomainError && error.code === "IDEMPOTENCY_CONFLICT",
  );
});
