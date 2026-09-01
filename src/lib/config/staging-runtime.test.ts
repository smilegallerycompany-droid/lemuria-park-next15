import assert from "node:assert/strict";
import { test } from "node:test";
import { DomainError } from "@/server/domain/errors";
import { assertStagingTestPaymentAllowed, isStagingAppEnv } from "@/lib/config/staging-runtime";

test("isStagingAppEnv only accepts staging", () => {
  assert.equal(isStagingAppEnv("staging"), true);
  assert.equal(isStagingAppEnv("production"), false);
  assert.equal(isStagingAppEnv(""), false);
});

test("assertStagingTestPaymentAllowed requires staging env and staging DB name", () => {
  const stagingUrl = "postgresql://u:p@host:6432/lemuria_staging?sslmode=require";
  const prodUrl = "postgresql://u:p@host:6432/lemuria?sslmode=require";
  assert.doesNotThrow(() =>
    assertStagingTestPaymentAllowed({ appEnv: "staging", databaseUrl: stagingUrl }),
  );
  assert.throws(
    () => assertStagingTestPaymentAllowed({ appEnv: "production", databaseUrl: stagingUrl }),
    (error: unknown) => error instanceof DomainError && error.code === "STAGING_PAY_DISABLED",
  );
  assert.throws(
    () => assertStagingTestPaymentAllowed({ appEnv: "staging", databaseUrl: prodUrl }),
    (error: unknown) => error instanceof DomainError && error.code === "STAGING_PAY_DISABLED",
  );
});
