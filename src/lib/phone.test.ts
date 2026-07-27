import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "@/lib/phone";

test("normalizePhone strips spaces, parentheses and dashes", () => {
  assert.equal(normalizePhone("+7 (900) 123-45-67"), "+79001234567");
});

test("normalizePhone converts an 8XXXXXXXXXX Russian local number to +7XXXXXXXXXX", () => {
  assert.equal(normalizePhone("89001234567"), "+79001234567");
  assert.equal(normalizePhone("8 (900) 123-45-67"), "+79001234567");
});

test("normalizePhone preserves an already-international number as-is (never reinterprets it as Russian)", () => {
  assert.equal(normalizePhone("+14155552671"), "+14155552671");
  assert.equal(normalizePhone("+380501234567"), "+380501234567");
});

test("normalizePhone keeps a leading + when present", () => {
  assert.equal(normalizePhone("+7 900 123 45 67"), "+79001234567");
});
