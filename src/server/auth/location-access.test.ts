import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertLocationAccess,
  constrainLocationIds,
  locationIdsForActor,
} from "@/server/auth/location-access";
import { DomainError } from "@/server/domain/errors";
import type { StaffUser } from "@/server/auth/staff-session";

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

describe("locationIdsForActor", () => {
  it("ADMIN/OWNER are unrestricted", () => {
    assert.equal(locationIdsForActor(staff({ role: "ADMIN" })), null);
    assert.equal(locationIdsForActor(staff({ role: "OWNER" })), null);
  });

  it("CASHIER/DIRECTOR with empty bindings match nothing", () => {
    assert.deepEqual(locationIdsForActor(staff({ role: "CASHIER" })), []);
    assert.deepEqual(constrainLocationIds(staff({ role: "DIRECTOR" })), []);
  });
});

describe("assertLocationAccess", () => {
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

  it("cashier with empty bindings cannot open a specific location", () => {
    assert.throws(
      () => assertLocationAccess(staff({ role: "CASHIER", locationIds: [] }), "loc-a"),
      DomainError,
    );
  });
});
