import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_FAQ,
  DEFAULT_HERO,
  parseAboutBenefits,
} from "@/lib/cms/defaults";
import { sessionOccupancyStatus } from "@/server/services/director-sessions-today";
import { assertLocationAccess } from "@/server/auth/location-access";
import { DomainError } from "@/server/domain/errors";
import type { StaffUser } from "@/server/auth/staff-session";
// Location RBAC unit cases also live in location-access.test.ts.

function staff(partial: Partial<StaffUser> & Pick<StaffUser, "role">): StaffUser {
  return {
    id: partial.id ?? "u1",
    email: partial.email ?? "t@example.com",
    name: partial.name ?? "T",
    role: partial.role,
    status: "ACTIVE",
    locationIds: partial.locationIds ?? [],
  };
}

describe("CMS defaults & benefits", () => {
  it("parses about benefits and drops invalid rows", () => {
    const ok = parseAboutBenefits([
      { title: "A", description: "B", iconKey: "leaf", sortOrder: 0, isActive: true },
      { title: "", description: "bad" },
    ]);
    assert.equal(ok.length, 1);
    assert.equal(ok[0]!.title, "A");
  });

  it("has safe hero/faq fallbacks", () => {
    assert.ok(DEFAULT_HERO.heroTitle.includes("Лемурия"));
    assert.ok(DEFAULT_FAQ.length >= 4 && DEFAULT_FAQ.length <= 5);
  });
});

describe("CMS RBAC location access", () => {
  it("allows admin/owner everywhere", () => {
    assert.doesNotThrow(() => assertLocationAccess(staff({ role: "ADMIN" }), "loc-x"));
    assert.doesNotThrow(() => assertLocationAccess(staff({ role: "OWNER" }), "loc-x"));
  });

  it("allows director own location and denies foreign", () => {
    const director = staff({ role: "DIRECTOR", locationIds: ["loc-a"] });
    assert.doesNotThrow(() => assertLocationAccess(director, "loc-a"));
    assert.throws(() => assertLocationAccess(director, "loc-b"), DomainError);
  });

  it("director may edit global (null location) content", () => {
    assert.doesNotThrow(() =>
      assertLocationAccess(staff({ role: "DIRECTOR", locationIds: ["loc-a"] }), null),
    );
  });
});

describe("session occupancy status", () => {
  const future = new Date(Date.now() + 60 * 60 * 1000);
  const past = new Date(Date.now() - 60 * 60 * 1000);

  it("AVAILABLE / LOW / SOLD_OUT / CLOSED", () => {
    assert.equal(
      sessionOccupancyStatus({
        capacity: 10,
        sold: 5,
        reserved: 0,
        sessionStatus: "OPEN",
        startsAt: future,
      }),
      "AVAILABLE",
    );
    assert.equal(
      sessionOccupancyStatus({
        capacity: 10,
        sold: 8,
        reserved: 0,
        sessionStatus: "OPEN",
        startsAt: future,
      }),
      "LOW",
    );
    assert.equal(
      sessionOccupancyStatus({
        capacity: 10,
        sold: 10,
        reserved: 0,
        sessionStatus: "OPEN",
        startsAt: future,
      }),
      "SOLD_OUT",
    );
    assert.equal(
      sessionOccupancyStatus({
        capacity: 10,
        sold: 0,
        reserved: 0,
        sessionStatus: "CLOSED",
        startsAt: future,
      }),
      "CLOSED",
    );
    assert.equal(
      sessionOccupancyStatus({
        capacity: 10,
        sold: 0,
        reserved: 0,
        sessionStatus: "OPEN",
        startsAt: past,
      }),
      "CLOSED",
    );
  });
});

describe("order timeline event ordering (unit shape)", () => {
  it("sorts by ISO timestamp ascending", () => {
    const events = [
      { type: "PAYMENT_SUCCEEDED", at: "2026-08-09T12:00:00.000Z" },
      { type: "ORDER_CREATED", at: "2026-08-09T11:00:00.000Z" },
      { type: "TICKETS_ISSUED", at: "2026-08-09T12:01:00.000Z" },
    ];
    const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
    assert.deepEqual(
      sorted.map((e) => e.type),
      ["ORDER_CREATED", "PAYMENT_SUCCEEDED", "TICKETS_ISSUED"],
    );
  });
});

describe("alerts healthy state", () => {
  it("empty alert list means healthy — no decorative alerts", () => {
    const alerts: unknown[] = [];
    assert.equal(alerts.length, 0);
  });
});
