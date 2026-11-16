"use strict";

const assert = require("node:assert/strict");
const { randomBytes, randomInt, randomUUID } = require("node:crypto");
const http = require("node:http");
require("/app/container-bootstrap.cjs").applyDatabaseUrlFromEnv(process.env);
const { PrismaClient } = require("/app/node_modules/@prisma/client");
const bcrypt = require("/app/node_modules/bcryptjs");
const db = new PrismaClient({ log: [] });
const origin = "https://d5d9sorlbdsebnpfr97f.0ly8ed4d.apigw.yandexcloud.net";

async function request(path, { cookie, body, key } = {}) {
  const response = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { "Idempotency-Key": key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  const result = await response.json();
  return { status: response.status, data: result.data, error: result.error?.code, cookie: response.headers.getSetCookie().map((header) => header.split(";")[0]).join("; ") };
}

async function run() {
  assert.equal(process.env.APP_ENV, "staging");
  const [database] = await db.$queryRaw`SELECT current_database() AS name`;
  assert.equal(database.name, "lemuria_staging");
  const location = await db.location.findFirstOrThrow({ where: { slug: "saratov", park: "LEMURIA", status: "ACTIVE" } });
  let user, shift, session;
  const reservations = [];
  try {
    const password = randomBytes(32).toString("base64url");
    user = await db.user.create({ data: {
      name: "Synthetic seat reserve QA", email: "qa-reserve-" + randomUUID() + "@example.invalid",
      passwordHash: await bcrypt.hash(password, 12), role: "CASHIER", status: "ACTIVE",
      locations: { create: { locationId: location.id } },
    } });
    const auth = await request("/api/auth/login", { body: { email: user.email, password, portal: "cashier" } });
    assert.equal(auth.status, 200, auth.error);
    const cookie = auth.cookie;
    shift = await db.cashierShift.create({ data: {
      userId: user.id, locationId: location.id, status: "OPEN", openingCashAmount: 0,
    } });
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    while (date.getUTCDay() !== 0) date.setUTCDate(date.getUTCDate() + 1);
    date.setUTCHours(14, 30, randomInt(1, 60), randomInt(1, 1000));
    session = await db.session.create({ data: {
      locationId: location.id, park: location.park, startsAt: date, endsAt: new Date(+date + 20 * 60_000),
      capacity: 15, status: "SCHEDULED",
    } });
    const selection = (quantity) => ({ sessionPublicId: session.publicId, items: [{ ticketTypeCode: "ADULT", quantity }] });
    const reserve = (quantity) => request("/api/public/reservations", { body: selection(quantity), key: randomUUID() });
    const quote = (quantity) => request("/api/cashier/quote", { cookie, body: selection(quantity) });
    const sale = (quantity, fingerprint) => request("/api/cashier/sales", { cookie, key: randomUUID(), body: {
      ...selection(quantity), paymentMethod: "CASH", quoteFingerprint: fingerprint, adultCompanionConfirmed: true,
    } });
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: location.timezone }).format(date);
    const path = "/api/public/sessions?locationSlug=saratov&date=" + localDate;
    const readPublic = async () => {
      const result = await request(path);
      assert.equal(result.status, 200, result.error);
      const row = result.data.sessions.find((item) => item.publicId === session.publicId);
      assert.ok(row, "The public feed includes the synthetic session");
      return row.remainingSeats;
    };

    assert.equal(await readPublic(), 15);
    for (const quantity of [8, 7]) {
      const hold = await reserve(quantity);
      assert.ok([200, 201].includes(hold.status), "Online hold " + hold.error);
      reservations.push(hold.data.publicId);
    }
    assert.equal(await readPublic(), 0);
    assert.equal((await reserve(1)).error, "SESSION_SOLD_OUT");
    assert.equal((await quote(4)).error, "INSUFFICIENT_CAPACITY");
    const permitted = await quote(2);
    assert.equal(permitted.status, 200, permitted.error);
    assert.equal((await sale(2, permitted.data.fingerprint)).status, 201);
    const last = await quote(1);
    assert.equal(last.status, 200, last.error);
    const raced = await Promise.all([sale(1, last.data.fingerprint), sale(1, last.data.fingerprint)]);
    assert.equal(raced.filter((result) => result.status === 201).length, 1, JSON.stringify(raced.map((row) => [row.status, row.error])));
    assert.ok(raced.some((result) => result.error === "SESSION_SOLD_OUT"));
    assert.equal((await quote(1)).error, "SESSION_SOLD_OUT");
    assert.equal(await readPublic(), 0);
    assert.equal(await db.ticket.count({ where: { sessionId: session.id, status: "VALID" } }), 3);
    const persisted = await db.session.findUniqueOrThrow({ where: { id: session.id } });
    assert.equal(persisted.capacity, 15);
    return { ok: true, originalLimit: 15, cashierLimit: 18, publicClosed: true, concurrentCheckout: true };
  } finally {
    if (reservations.length) await db.reservation.updateMany({
      where: { publicId: { in: reservations } }, data: { status: "EXPIRED", expiresAt: new Date() },
    });
    if (session) {
      await db.ticket.updateMany({ where: { sessionId: session.id }, data: { status: "CANCELLED" } });
      await db.order.updateMany({ where: { sessionId: session.id }, data: { status: "CANCELLED" } });
      await db.session.update({ where: { id: session.id }, data: { status: "CANCELLED" } });
    }
    if (shift) await db.cashierShift.update({ where: { id: shift.id }, data: { closedAt: new Date(), status: "CLOSED" } });
    if (user) {
      await db.staffSession.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
      await db.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
    }
  }
}

http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" || req.url !== "/test") return res.writeHead(404).end("{}");
  try {
    res.end(JSON.stringify(await run()));
  } catch (error) {
    res.writeHead(500).end(JSON.stringify({ ok: false, message: String(error.message).slice(0, 230) }));
  }
}).listen(Number(process.env.PORT || 8080), "0.0.0.0");
