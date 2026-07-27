import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSessionBookable, isSessionBookable } from "@/server/domain/session.domain";
import { DomainError } from "@/server/domain/errors";

const NOW = new Date("2026-07-25T10:00:00.000Z");

test("isSessionBookable requires SCHEDULED or OPEN status and a future startsAt", () => {
  assert.equal(
    isSessionBookable({ status: "SCHEDULED", startsAt: new Date("2026-07-25T11:00:00.000Z") }, NOW),
    true,
  );
  assert.equal(
    isSessionBookable({ status: "OPEN", startsAt: new Date("2026-07-25T11:00:00.000Z") }, NOW),
    true,
  );
  assert.equal(
    isSessionBookable({ status: "CANCELLED", startsAt: new Date("2026-07-25T11:00:00.000Z") }, NOW),
    false,
  );
  assert.equal(
    isSessionBookable({ status: "SCHEDULED", startsAt: new Date("2026-07-25T09:00:00.000Z") }, NOW),
    false,
  );
});

test("assertSessionBookable throws SESSION_NOT_FOUND for a missing session", () => {
  assert.throws(
    () => assertSessionBookable(null, NOW),
    (error: unknown) => error instanceof DomainError && error.code === "SESSION_NOT_FOUND",
  );
});

test("assertSessionBookable throws SESSION_NOT_AVAILABLE for a session that can't be booked", () => {
  assert.throws(
    () =>
      assertSessionBookable(
        { status: "CANCELLED", startsAt: new Date("2026-07-25T11:00:00.000Z") },
        NOW,
      ),
    (error: unknown) => error instanceof DomainError && error.code === "SESSION_NOT_AVAILABLE",
  );
});

test("assertSessionBookable does not throw for a bookable session", () => {
  assert.doesNotThrow(() =>
    assertSessionBookable(
      { status: "SCHEDULED", startsAt: new Date("2026-07-25T11:00:00.000Z") },
      NOW,
    ),
  );
});
