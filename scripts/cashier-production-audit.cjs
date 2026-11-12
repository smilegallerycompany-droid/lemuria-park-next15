"use strict";

// IAM-private diagnostic. Production transactions are explicitly read-only.
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const { PrismaClient } = require("/app/node_modules/@prisma/client");
const invitation = require("/app/invitation-policy.cjs");
const finance = require("/app/finance-report-policy.cjs");

require("/app/container-bootstrap.cjs").applyDatabaseUrlFromEnv(process.env);
const databaseUrl = new URL(process.env.DATABASE_URL);
if (databaseUrl.port === "6432") databaseUrl.searchParams.set("pgbouncer", "true");
databaseUrl.searchParams.set("connection_limit", "1");
const db = new PrismaClient({ datasources: { db: { url: databaseUrl.href } } });
const batches = ["printed-lemuria-10-20261109", "private-printed-lemuria-20261110"];

async function audit() {
  assert.equal(process.env.APP_ENV, "production");
  const scope = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const [database] = await tx.$queryRaw`SELECT current_database() AS name`;
    assert.equal(database.name, "lemuria");
    const location = await tx.location.findUnique({ where: { slug: "saratov" }, select: { id: true, status: true } });
    assert.equal(location.status, "ACTIVE");
    const inventory = [];
    for (const batch of batches) {
      const issued = await tx.auditLog.findMany({
        where: { entityType: invitation.TYPE, action: "INVITATION_ISSUED", metadata: { path: ["batch"], equals: batch } },
        select: { action: true, entityType: true, metadata: true },
      });
      const hashes = issued.map((entry) => entry.metadata.tokenHash);
      for (const [index, entry] of issued.entries()) {
        assert.ok(invitation.validIssue(entry, hashes[index]));
        assert.equal(entry.metadata.locationId, location.id);
      }
      const count = (type) => tx.auditLog.count({ where: { id: { in: hashes.map((value) => invitation.key(type, value)) } } });
      const unavailable = await tx.auditLog.findMany({
        where: { id: { in: hashes.flatMap((value) => [invitation.key("use", value), invitation.key("cancel", value)]) } },
        select: { id: true },
      });
      const blocked = new Set(unavailable.map(({ id }) => id.slice(-64)));
      inventory.push({ batch, registered: issued.length, used: await count("use"), cancelled: await count("cancel"),
        unusedUncancelled: issued.length - blocked.size });
    }

    const payoutKinds = ["EXPENSE", "TEMP_STAFF", "SALARY", "ADVANCE", "COMMISSION"];
    const grouped = await tx.parkOperation.groupBy({ by: ["kind", "method"], where: {
      locationId: location.id, cancelledAt: null, date: { gte: "2026-11-07" }, kind: { in: payoutKinds },
    }, _count: { _all: true } });
    return { inventory, payoutMethods: grouped.map(({ kind, method, _count }) => ({ kind, method, count: _count._all })) };
  }, { timeout: 25000 });

  const checkIn = fs.readFileSync("/app/.next/server/app/api/cashier/check-in/route.js", "utf8");
  assert.ok(checkIn.includes("/app/invitation-policy.cjs"));
  for (const kind of ["EXPENSE", "TEMP_STAFF", "SALARY", "ADVANCE", "COMMISSION"]) {
    const entry = finance.prepareEntry({ kind, note: "QA", method: "CASH", amountKopecks: 100 });
    assert.equal(entry.method, "CASH");
    assert.ok(finance.isSafe(entry));
    assert.equal(finance.cashDelta(entry), 0);
  }
  return { ok: true, ...scope, invitationCheckIn: true, safeCashPolicy: true };
}

http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" || req.url !== "/qa") {
    res.writeHead(404).end("{}");
    return;
  }
  try {
    res.end(JSON.stringify(await audit()));
  } catch (error) {
    res.writeHead(500).end(JSON.stringify({ ok: false, error: error.code || error.name }));
  }
}).listen(Number(process.env.PORT || 8080), "0.0.0.0");
