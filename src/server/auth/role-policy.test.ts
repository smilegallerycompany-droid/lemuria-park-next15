import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCanAssignRole,
  canManageRole,
} from "@/server/auth/role-policy";
import { DomainError } from "@/server/domain/errors";
import { hasCoordinates, resolveRouteUrl } from "@/lib/maps/types";

describe("role policy", () => {
  it("blocks DIRECTOR → ADMIN/OWNER and ADMIN → OWNER", () => {
    assert.equal(canManageRole("DIRECTOR", "CASHIER"), true);
    assert.equal(canManageRole("DIRECTOR", "ADMIN"), false);
    assert.throws(() => assertCanAssignRole("DIRECTOR", "ADMIN"), DomainError);
    assert.throws(() => assertCanAssignRole("ADMIN", "OWNER"), DomainError);
    assert.doesNotThrow(() => assertCanAssignRole("OWNER", "ADMIN"));
  });
});

describe("location map helpers", () => {
  it("detects coordinates and prefers routeUrl", () => {
    assert.equal(hasCoordinates({ latitude: 45.01, longitude: 39.02 }), true);
    assert.equal(hasCoordinates({ latitude: null, longitude: 39 }), false);
    const url = resolveRouteUrl({
      latitude: 1,
      longitude: 2,
      address: "Test",
      routeUrl: "https://example.com/route",
    });
    assert.equal(url, "https://example.com/route");
  });
});
