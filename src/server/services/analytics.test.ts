import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sumPaidRevenueKopecks } from "@/server/services/analytics";

describe("sumPaidRevenueKopecks", () => {
  it("counts only PAID orders and ignores reservation / awaiting payment", () => {
    const total = sumPaidRevenueKopecks([
      { status: "PAID", totalAmount: 150_000 },
      { status: "AWAITING_PAYMENT", totalAmount: 90_000 },
      { status: "DRAFT", totalAmount: 40_000 },
      { status: "CANCELLED", totalAmount: 20_000 },
      { status: "PAID", totalAmount: 50_000 },
      { status: "REFUNDED", totalAmount: 30_000 },
    ]);
    assert.equal(total, 200_000);
  });

  it("returns zero for empty input", () => {
    assert.equal(sumPaidRevenueKopecks([]), 0);
  });
});
