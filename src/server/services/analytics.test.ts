import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  averagePaidOrderValueKopecks,
  classifyPaymentMethodRevenue,
  netRevenueKopecks,
  occupancyRate,
  sumPaidRevenueKopecks,
} from "@/server/services/analytics";

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

describe("averagePaidOrderValueKopecks", () => {
  it("averages only PAID orders with deterministic rounding", () => {
    // (90000 + 110000) / 2 = 100000
    assert.equal(
      averagePaidOrderValueKopecks([
        { status: "PAID", totalAmount: 90_000 },
        { status: "AWAITING_PAYMENT", totalAmount: 999_999 },
        { status: "PAID", totalAmount: 110_000 },
      ]),
      100_000,
    );
  });

  it("returns 0 when no PAID orders", () => {
    assert.equal(averagePaidOrderValueKopecks([{ status: "CANCELLED", totalAmount: 10 }]), 0);
  });
});

describe("netRevenueKopecks", () => {
  it("subtracts refunds and never goes negative", () => {
    assert.equal(netRevenueKopecks(500_000, 120_000), 380_000);
    assert.equal(netRevenueKopecks(100_000, 250_000), 0);
  });
});

describe("occupancyRate", () => {
  it("computes booked/capacity with known fixtures", () => {
    assert.equal(occupancyRate(3, 10), 0.3);
    assert.equal(occupancyRate(0, 15), 0);
    assert.equal(occupancyRate(5, 0), 0);
  });
});

describe("classifyPaymentMethodRevenue", () => {
  it("splits cash/card/other with deterministic totals", () => {
    const buckets = classifyPaymentMethodRevenue([
      { method: "CASH", amount: 90_000, status: "SUCCEEDED" },
      { method: "CARD_ONLINE", amount: 110_000, status: "SUCCEEDED" },
      { method: "CARD_TERMINAL", amount: 80_000, status: "SUCCEEDED" },
      { method: "CASH", amount: 50_000, status: "PENDING" },
      { method: "OTHER", amount: 20_000, status: "SUCCEEDED" },
    ]);
    assert.equal(buckets.cash, 90_000);
    assert.equal(buckets.card, 190_000);
    assert.equal(buckets.other, 20_000);
  });
});
