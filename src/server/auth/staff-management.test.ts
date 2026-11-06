import assert from "node:assert/strict";
import { test } from "node:test";
import { managedStaffFilter, assertManagedStaffAccess } from "./staff-management";
import type { StaffUser } from "./staff-session";

const director: StaffUser = {
  id: "director",
  name: "Test",
  email: "test@example.com",
  role: "DIRECTOR",
  status: "ACTIVE",
  locationIds: ["owned"],
};
test("staff list and mutations cannot cross the director's location boundary", () => {
  const target = (ids: string[]) => ({
    id: "cashier",
    role: "CASHIER" as const,
    locations: ids.map((locationId) => ({ locationId })),
  });
  assert.doesNotThrow(() => assertManagedStaffAccess(director, target(["owned"])));
  for (const ids of [[], ["foreign"], ["owned", "foreign"]]) {
    assert.throws(() => assertManagedStaffAccess(director, target(ids)), { code: "FORBIDDEN" });
  }
  assert.throws(() => assertManagedStaffAccess(director, { ...target(["owned"]), role: "ADMIN" }), {
    code: "FORBIDDEN",
  });
  assert.deepEqual(managedStaffFilter(director), {
    role: "CASHIER",
    locations: {
      some: { locationId: { in: ["owned"] } },
      every: { locationId: { in: ["owned"] } },
    },
  });
  const empty = managedStaffFilter({ ...director, locationIds: [] });
  assert.deepEqual(empty.locations, {
    some: { locationId: { in: [] } },
    every: { locationId: { in: [] } },
  });
});
