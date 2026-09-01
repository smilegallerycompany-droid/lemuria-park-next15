import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGING_DATABASE_NAME,
  assertAllowStagingSeed,
  assertStagingDatabaseName,
  databaseNameFromUrl,
} from "@/lib/config/staging-db-guard";

test("databaseNameFromUrl reads the path and ignores credentials", () => {
  assert.equal(
    databaseNameFromUrl("postgresql://user:secret@host:6432/lemuria_staging?sslmode=require"),
    STAGING_DATABASE_NAME,
  );
  assert.equal(databaseNameFromUrl("postgresql://u:***@h:6432/db1"), "db1");
  assert.equal(databaseNameFromUrl("not-a-url"), null);
});

test("assertStagingDatabaseName rejects production db1", () => {
  assert.throws(() => assertStagingDatabaseName("db1"), /lemuria_staging/);
  assert.doesNotThrow(() => assertStagingDatabaseName("lemuria_staging"));
});

test("assertAllowStagingSeed requires explicit flag", () => {
  assert.throws(() => assertAllowStagingSeed(undefined), /ALLOW_STAGING_SEED/);
  assert.throws(() => assertAllowStagingSeed("true"), /ALLOW_STAGING_SEED/);
  assert.doesNotThrow(() => assertAllowStagingSeed("1"));
});
