#!/usr/bin/env node
/**
 * Runtime launcher for Yandex Serverless Containers.
 * Assembles DATABASE_URL from DB_* parts when DATABASE_URL is absent.
 * Never logs the password or the full URL.
 */
"use strict";

const { spawn, spawnSync } = require("node:child_process");

const DEFAULT_PORT = "6432";

function assembleDatabaseUrl(parts) {
  const host = String(parts.host ?? "").trim();
  const port = String(parts.port ?? DEFAULT_PORT).trim() || DEFAULT_PORT;
  const user = String(parts.user ?? "");
  const password = String(parts.password ?? "");
  const database = String(parts.database ?? "").trim();
  const sslmode = String(parts.sslmode ?? "require").trim();

  if (!host || !user || !password || !database) {
    throw new Error("Refusing: DB_HOST, DB_USER, DB_PASSWORD and DB_NAME are required to assemble DATABASE_URL.");
  }
  if (!/^[A-Za-z0-9.-]+$/.test(host)) {
    throw new Error("Refusing: DB_HOST must be a DNS hostname.");
  }
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error("Refusing: DB_PORT must be a TCP port.");
  }
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error("Refusing: DB_NAME must be a single PostgreSQL database name.");
  }

  const url = new URL("postgresql://127.0.0.1/placeholder");
  url.hostname = host;
  url.port = port;
  url.pathname = `/${database}`;
  url.search = "";
  if (sslmode) url.searchParams.set("sslmode", sslmode);

  // WHATWG username/password setters leave some reserved characters unescaped
  // (`&`, trailing `%`). Encode credentials separately, then attach host/path/query.
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${url.host}${url.pathname}${url.search}`;
}

function applyDatabaseUrlFromEnv(env) {
  const existing = String(env.DATABASE_URL ?? "").trim();
  if (existing) return { source: "DATABASE_URL", applied: false };

  const assembled = assembleDatabaseUrl({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    sslmode: env.DB_SSLMODE,
  });
  env.DATABASE_URL = assembled;
  return { source: "DB_*", applied: true };
}

function refuseUnlessStaging(flagName, appEnv) {
  if (appEnv === "staging") return;
  console.error(`Refusing ${flagName}: APP_ENV must be staging (got '${appEnv || ""}').`);
  process.exit(1);
}

function runSync(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runServer() {
  const child = spawn(process.execPath, ["server.js"], {
    stdio: "inherit",
    env: process.env,
  });
  const forward = (signal) => {
    process.on(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  };
  forward("SIGTERM");
  forward("SIGINT");
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

function main() {
  try {
    const result = applyDatabaseUrlFromEnv(process.env);
    console.log(`database_url_source=${result.source}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Failed to assemble database URL");
    process.exit(1);
  }

  if (process.env.RUN_MIGRATE_ON_START === "1") {
    refuseUnlessStaging("RUN_MIGRATE_ON_START", process.env.APP_ENV);
    runSync("prisma", ["migrate", "deploy"]);
  }

  if (process.env.RUN_STAGING_SEED_ON_START === "1") {
    refuseUnlessStaging("RUN_STAGING_SEED_ON_START", process.env.APP_ENV);
    if (process.env.ALLOW_STAGING_SEED !== "1") {
      console.error("Refusing seed: ALLOW_STAGING_SEED=1 is required.");
      process.exit(1);
    }
    runSync(process.execPath, ["prisma/staging-seed.cjs"]);
  }

  runServer();
}

module.exports = {
  assembleDatabaseUrl,
  applyDatabaseUrlFromEnv,
};

if (require.main === module) {
  main();
}
