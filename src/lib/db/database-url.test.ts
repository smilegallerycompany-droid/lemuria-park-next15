import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const bootstrap = require(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../container-bootstrap.cjs"));

describe("assembleDatabaseUrl", () => {
  it("percent-encodes reserved characters in username and password", () => {
    const url = bootstrap.assembleDatabaseUrl({
      host: "rc1a-example.mdb.yandexcloud.net",
      port: "6432",
      user: "user@name",
      password: "p@ss:w/rd?#x&y=1%",
      database: "db1",
      sslmode: "require",
    });

    assert.equal(url.includes("p@ss:w/rd"), false);
    assert.equal(url.includes("user@name"), false);
    assert.equal(url.includes("%26"), true);
    assert.equal(url.includes("%25"), true);
    assert.match(url, /^postgresql:\/\//);

    const parsed = new URL(url);
    assert.equal(parsed.hostname, "rc1a-example.mdb.yandexcloud.net");
    assert.equal(parsed.port, "6432");
    assert.equal(decodeURIComponent(parsed.username), "user@name");
    assert.equal(decodeURIComponent(parsed.password), "p@ss:w/rd?#x&y=1%");
    assert.equal(parsed.pathname, "/db1");
    assert.equal(parsed.searchParams.get("sslmode"), "require");
  });

  it("encodes a password that would otherwise break the URL authority", () => {
    const url = bootstrap.assembleDatabaseUrl({
      host: "db.example",
      port: "6432",
      user: "lemuria_app",
      password: "a/b@c:d",
      database: "lemuria",
    });
    const parsed = new URL(url);
    assert.equal(parsed.username, "lemuria_app");
    assert.equal(decodeURIComponent(parsed.password), "a/b@c:d");
    assert.equal(url.includes("@db.example"), true);
  });

  it("rejects incomplete parts instead of concatenating an invalid URL", () => {
    assert.throws(
      () =>
        bootstrap.assembleDatabaseUrl({
          host: "db.example",
          user: "app",
          password: "",
          database: "db1",
        }),
      /DB_HOST, DB_USER, DB_PASSWORD and DB_NAME/,
    );
  });
});

describe("applyDatabaseUrlFromEnv", () => {
  it("leaves an existing DATABASE_URL untouched", () => {
    const env = {
      DATABASE_URL: "postgresql://staging:preset@db.example:6432/lemuria_staging?sslmode=require",
      DB_PASSWORD: "should-not-be-used",
      DB_HOST: "other.example",
      DB_USER: "other",
      DB_NAME: "otherdb",
    };
    const result = bootstrap.applyDatabaseUrlFromEnv(env);
    assert.equal(result.source, "DATABASE_URL");
    assert.equal(result.applied, false);
    assert.equal(
      env.DATABASE_URL,
      "postgresql://staging:preset@db.example:6432/lemuria_staging?sslmode=require",
    );
  });

  it("assembles DATABASE_URL from DB_* without returning the secret", () => {
    const env: Record<string, string> = {
      DB_HOST: "db.example",
      DB_PORT: "6432",
      DB_USER: "user1",
      DB_PASSWORD: "s3cret/value",
      DB_NAME: "db1",
    };
    const result = bootstrap.applyDatabaseUrlFromEnv(env);
    assert.equal(result.source, "DB_*");
    assert.equal(result.applied, true);
    assert.equal(JSON.stringify(result).includes("s3cret"), false);
    const parsed = new URL(env.DATABASE_URL);
    assert.equal(decodeURIComponent(parsed.password), "s3cret/value");
  });
});
