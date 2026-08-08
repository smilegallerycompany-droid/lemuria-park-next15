import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  averageOrderValueKopecks,
  averageTicketPriceKopecks,
  compareKpi,
  comparisonWindow,
  percentChange,
  ratePercent,
  safeDivide,
} from "@/server/services/analytics-formulas";

describe("analytics formulas", () => {
  it("computes net-style averages without division by zero", () => {
    assert.equal(averageOrderValueKopecks(300_000, 3), 100_000);
    assert.equal(averageOrderValueKopecks(300_000, 0), 0);
    assert.equal(averageTicketPriceKopecks(180_000, 2), 90_000);
    assert.equal(averageTicketPriceKopecks(180_000, 0), 0);
  });

  it("handles percent change and compare labels for zero baseline", () => {
    assert.equal(percentChange(100, 50), 100);
    assert.equal(percentChange(50, 0), null);
    assert.equal(safeDivide(10, 0), null);
    assert.equal(compareKpi(120, 0).label, "new");
    assert.equal(compareKpi(0, 0).label, "no_baseline");
    assert.equal(compareKpi(150, 100).percent, 50);
  });

  it("builds previous comparable window of equal duration", () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-08-07T23:59:59.999Z");
    const prev = comparisonWindow(from, to);
    const duration = to.getTime() - from.getTime();
    assert.equal(prev.to.getTime(), from.getTime() - 1);
    assert.equal(prev.to.getTime() - prev.from.getTime(), duration);
  });

  it("computes attendance/occupancy rates safely as 0..1", () => {
    assert.equal(ratePercent(3, 10), 0.3);
    assert.equal(ratePercent(5, 0), 0);
  });
});
