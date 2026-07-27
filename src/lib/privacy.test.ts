import { test } from "node:test";
import assert from "node:assert/strict";
import { maskEmail, maskPhone } from "@/lib/privacy";

test("maskPhone keeps a short prefix/suffix and masks the middle", () => {
  const masked = maskPhone("+79001234567");
  assert.match(masked, /^\+79•+67$/);
  assert.ok(!masked.includes("001234"));
});

test("maskPhone never throws on very short input", () => {
  assert.doesNotThrow(() => maskPhone("12"));
});

test("maskEmail keeps the domain and a short local-part prefix, masks the rest", () => {
  const masked = maskEmail("ivan.petrov@example.com");
  assert.match(masked, /^iv•+@example\.com$/);
  assert.ok(!masked.includes("petrov"));
});

test("maskEmail handles a very short local part", () => {
  const masked = maskEmail("a@example.com");
  assert.match(masked, /^a••@example\.com$/);
});
