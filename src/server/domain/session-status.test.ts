import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DomainError } from "@/server/domain/errors";
import {
  assertSessionStatusTransition,
  canTransitionSessionStatus,
} from "@/server/domain/session-status";

describe("session status transitions", () => {
  it("allows SCHEDULED → OPEN / CLOSED / CANCELLED", () => {
    assert.equal(canTransitionSessionStatus("SCHEDULED", "OPEN"), true);
    assert.equal(canTransitionSessionStatus("SCHEDULED", "COMPLETED"), false);
  });

  it("treats CANCELLED and COMPLETED as terminal", () => {
    assert.equal(canTransitionSessionStatus("CANCELLED", "OPEN"), false);
    assert.equal(canTransitionSessionStatus("COMPLETED", "OPEN"), false);
    assert.throws(() => assertSessionStatusTransition("CANCELLED", "SCHEDULED"), DomainError);
  });

  it("allows identity (no-op) updates", () => {
    assert.equal(canTransitionSessionStatus("OPEN", "OPEN"), true);
  });
});
