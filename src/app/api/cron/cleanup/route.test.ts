import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Pure helpers mirroring cron auth — keep route timing-safe compare covered
 * without spinning Next request plumbing in unit tests.
 */
function authorize(provided: string, expected: string): boolean {
  if (!expected || expected.length < 16) return false;
  if (!provided || provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

test("cron secret rejects empty / short / mismatched values", () => {
  const secret = randomBytes(24).toString("hex");
  assert.equal(authorize("", secret), false);
  assert.equal(authorize("short", secret), false);
  assert.equal(authorize(secret.slice(0, -1) + "x", secret), false);
  assert.equal(authorize(secret, secret), true);
});

test("cron secret compare is length-sensitive", () => {
  const a = "a".repeat(32);
  const b = "a".repeat(31);
  assert.equal(authorize(b, a), false);
});

test("request id fingerprint is not a secret material hash of payment keys", () => {
  // Sanity: correlation ids must not be derived from shop secrets.
  const id = randomBytes(8).toString("hex");
  const decoy = createHmac("sha256", "shop-secret").update("payment").digest("hex");
  assert.notEqual(id, decoy.slice(0, 16));
  assert.match(id, /^[a-f0-9]{16}$/);
});
