import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cashierGate, isCashierAppUser, isStaffSessionAlive } from "./cashier-entry";

describe("cashierGate", () => {
  it("sends anonymous users from /cashier to login", () => {
    assert.equal(cashierGate(null, "app"), "redirect-login");
  });

  it("shows the login form to anonymous /cashier/login", () => {
    assert.equal(cashierGate(null, "login"), "show-login");
  });

  it("lets an active cashier into the app and off the login page", () => {
    const cashier = { role: "CASHIER", status: "ACTIVE" };
    assert.equal(isCashierAppUser(cashier), true);
    assert.equal(cashierGate(cashier, "app"), "show-app");
    assert.equal(cashierGate(cashier, "login"), "redirect-app");
  });

  it("lets active admin and owner use the cashier app", () => {
    for (const role of ["ADMIN", "OWNER", "DIRECTOR"]) {
      const user = { role, status: "ACTIVE" };
      assert.equal(cashierGate(user, "app"), "show-app");
      assert.equal(cashierGate(user, "login"), "redirect-app");
    }
  });

  it("treats a disabled user as logged out", () => {
    const disabled = { role: "CASHIER", status: "DISABLED" };
    assert.equal(isCashierAppUser(disabled), false);
    assert.equal(cashierGate(disabled, "app"), "redirect-login");
    assert.equal(cashierGate(disabled, "login"), "show-login");
  });
});

describe("isStaffSessionAlive", () => {
  const now = new Date("2026-09-03T00:00:00.000Z");

  it("rejects revoked and expired sessions", () => {
    assert.equal(
      isStaffSessionAlive({ revokedAt: new Date("2026-09-02T00:00:00.000Z"), expiresAt: new Date("2026-09-04T00:00:00.000Z") }, now),
      false,
    );
    assert.equal(
      isStaffSessionAlive({ revokedAt: null, expiresAt: new Date("2026-09-02T23:59:59.000Z") }, now),
      false,
    );
  });

  it("accepts a live unrevoked session", () => {
    assert.equal(
      isStaffSessionAlive({ revokedAt: null, expiresAt: new Date("2026-09-03T12:00:00.000Z") }, now),
      true,
    );
  });
});
