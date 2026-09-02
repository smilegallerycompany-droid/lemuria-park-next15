import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDateInTimezone,
  formatTimeInTimezone,
  startOfLocalDateInTimezone,
  todayInTimezone,
} from "./datetime";

describe("startOfLocalDateInTimezone", () => {
  it("returns 00:00 Europe/Moscow, including overnight hours before 03:00", () => {
    const start = startOfLocalDateInTimezone("2026-09-03", "Europe/Moscow");
    assert.equal(formatDateInTimezone(start, "Europe/Moscow"), "2026-09-03");
    assert.equal(formatTimeInTimezone(start, "Europe/Moscow"), "00:00");
    const saleAt = new Date("2026-09-02T22:04:30.000Z"); // 01:04 MSK
    assert.equal(todayInTimezone("Europe/Moscow", saleAt), "2026-09-03");
    assert.ok(saleAt.getTime() >= start.getTime());
  });
});
