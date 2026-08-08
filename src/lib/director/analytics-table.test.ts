import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessAnalyticsLocation,
  sortRows,
  toggleSort,
} from "@/lib/director/analytics-table";

describe("canAccessAnalyticsLocation", () => {
  it("allows all locations when staff has empty assignment (owner/admin)", () => {
    assert.equal(canAccessAnalyticsLocation([], "loc-1"), true);
    assert.equal(canAccessAnalyticsLocation([], null), true);
  });

  it("restricts to assigned locations", () => {
    assert.equal(canAccessAnalyticsLocation(["a", "b"], "a"), true);
    assert.equal(canAccessAnalyticsLocation(["a", "b"], "c"), false);
  });
});

describe("sortRows / toggleSort", () => {
  it("sorts numeric fields and toggles direction", () => {
    const rows = [
      { name: "B", revenue: 10 },
      { name: "A", revenue: 30 },
      { name: "C", revenue: 20 },
    ];
    assert.deepEqual(
      sortRows(rows, "revenue", "desc").map((r) => r.name),
      ["A", "C", "B"],
    );
    assert.deepEqual(toggleSort("revenue", "desc", "revenue"), {
      key: "revenue",
      dir: "asc",
    });
  });
});
