"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { PrismaClient } = require("/app/node_modules/@prisma/client");
const controls = require("./cashier-break-controls.cjs");
const standard = require("./session-break-policy.cjs");
const db = new PrismaClient({ log: [] });

async function run() {
  assert.equal(process.env.APP_ENV, "staging");
  const [database] = await db.$queryRaw`SELECT current_database() AS name`;
  assert.equal(database.name, "lemuria_staging");
  const location = await db.location.findFirst({ where: { slug: "saratov", park: "LEMURIA", status: "ACTIVE" } });
  assert.ok(location, "Active Saratov location required");
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: location.timezone, dateStyle: "short" }).format(new Date());
  const rows = await db.session.findMany({
    where: {
      locationId: location.id, park: location.park,
      startsAt: { gte: new Date(today + "T00:00:00+04:00"), lt: new Date(today + "T23:59:59+04:00") },
    },
  });
  const localTime = new Intl.DateTimeFormat("sv-SE", {
    timeZone: location.timezone, hour: "2-digit", minute: "2-digit",
  });
  const session13 = rows.find((row) => localTime.format(row.startsAt) === "13:00");
  const session17 = rows.find((row) => localTime.format(row.startsAt) === "17:00");
  assert.ok(session13 && session17, "A scheduled 13:00 or 17:00 session is missing in staging");
  const checkTime = new Date(today + "T12:50:00+04:00");
  const shift = { locationId: location.id };
  const initial = await controls.forShift(db, shift, location.id, checkTime);
  assert.ok(initial.slots.every((slot) => slot.canToggle), "The standard break sessions are not sellable in staging");

  // Read through the real Prisma session repository. Inject only the override
  // state to keep this check usable after the day's sessions finish.
  const ids = new Map([[session13.publicId, session13], [session17.publicId, session17]]);
  const cashSessions = await controls.filterCandidates(db, { locationId: location.id }, [...ids.values()], checkTime);
  const overrideId = `cashier-break:${location.id}:${today}:13:00`;
  const dbWithOverride = {
    auditLog: {
      findMany: async () => [{ id: overrideId, after: { open: true } }],
      findUnique: async ({ where: { id } }) =>
        id === overrideId ? { action: "CASHIER_BREAK_OVERRIDE_STATE", after: { open: true } } : null,
    },
    location: db.location,
    session: db.session,
  };
  const opened = await controls.filterCandidates(dbWithOverride, { locationId: location.id }, [...ids.values()], checkTime);
  assert.deepEqual(opened.map((session) => session.id), [session13.id]);
  assert.equal((await controls.findForCashier(dbWithOverride, session13.publicId, checkTime))?.id, session13.id);
  assert.equal(await controls.findForCashier(dbWithOverride, session17.publicId, checkTime), null);
  assert.deepEqual(await standard.filterCandidates(db, { locationId: location.id }, [...ids.values()]), []);
  return { ok: true, slotRowsVerified: 2, independentlyOpened: true, publicBreaksVerified: true, currentOpenSlots: cashSessions.length };
}

http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST" || req.url !== "/test") {
    res.writeHead(404).end("{}");
    return;
  }
  try {
    res.end(JSON.stringify(await run()));
  } catch (error) {
    res.writeHead(500).end(JSON.stringify({ ok: false, message: String(error.message).slice(0, 230) }));
  }
}).listen(Number(process.env.PORT || 8080), "0.0.0.0");
