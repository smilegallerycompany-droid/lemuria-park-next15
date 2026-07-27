import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoneyFromKopecks } from "@/lib/utils";

test("formatMoneyFromKopecks divides kopecks by 100 before formatting", () => {
  // 500 ₽ is stored as 50000 kopecks — the UI must show "500", never "50000".
  const formatted = formatMoneyFromKopecks(50000);
  assert.ok(formatted.includes("500"));
  assert.ok(!formatted.includes("50 000") && !formatted.includes("50000"));
});

test("formatMoneyFromKopecks renders a rouble sign", () => {
  assert.ok(formatMoneyFromKopecks(80000).includes("₽"));
});

test("formatMoneyFromKopecks handles zero", () => {
  assert.ok(formatMoneyFromKopecks(0).includes("0"));
});
