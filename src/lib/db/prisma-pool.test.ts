import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withPrismaPoolParams } from "./prisma-pool";

describe("withPrismaPoolParams", () => {
  it("adds pgbouncer and a single connection for the Yandex pooler port", () => {
    const url = withPrismaPoolParams("postgresql://app:secret@db.example:6432/lemuria_staging", {
      nodeEnv: "production",
    });
    assert.equal(url.includes("pgbouncer=true"), true);
    assert.equal(url.includes("connection_limit=1"), true);
    assert.equal(url.includes("secret"), true);
    assert.equal(url.startsWith("postgresql://app:secret@db.example:6432/lemuria_staging?"), true);
  });

  it("does not override an explicit connection_limit", () => {
    const url = withPrismaPoolParams(
      "postgresql://app:secret@db.example:6432/db1?sslmode=require&connection_limit=3",
      { nodeEnv: "production" },
    );
    assert.equal(url.includes("connection_limit=3"), true);
    assert.equal(url.includes("connection_limit=1"), false);
    assert.equal(url.includes("pgbouncer=true"), true);
    assert.equal(url.includes("sslmode=require"), true);
  });

  it("does not add pgbouncer on a direct Postgres port", () => {
    const url = withPrismaPoolParams("postgresql://app:secret@localhost:5432/lemuria", {
      nodeEnv: "development",
    });
    assert.equal(url.includes("pgbouncer"), false);
    assert.equal(url.includes("connection_limit"), false);
  });
});
