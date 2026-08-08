import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAnalyticsPeriod } from "@/server/services/analytics-period";

describe("resolveAnalyticsPeriod", () => {
  it("resolves today boundaries in Europe/Moscow", () => {
    const now = new Date("2026-08-08T12:00:00.000Z");
    const period = resolveAnalyticsPeriod({
      preset: "today",
      timeZone: "Europe/Moscow",
      now,
    });
    assert.equal(period.preset, "today");
    assert.ok(period.from.getTime() < period.to.getTime());
  });

  it("resolves last_7 as inclusive 7 calendar days", () => {
    const now = new Date("2026-08-08T12:00:00.000Z");
    const period = resolveAnalyticsPeriod({
      preset: "last_7",
      timeZone: "Europe/Moscow",
      now,
    });
    const days =
      (period.to.getTime() - period.from.getTime()) / (24 * 60 * 60 * 1000);
    assert.ok(days >= 6.9 && days <= 7.1);
  });
});
