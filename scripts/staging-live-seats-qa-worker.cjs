"use strict";

const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const http = require("node:http");
const { PrismaClient } = require("/app/node_modules/@prisma/client");
const bcrypt = require("/app/node_modules/bcryptjs");

const db = new PrismaClient({ log: [] });
const origin = "https://d5d9sorlbdsebnpfr97f.0ly8ed4d.apigw.yandexcloud.net";

async function request(path, { cookie, body, key } = {}) {
  const response = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    redirect: "manual",
    headers: {
      Origin: origin, "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  const json = await response.json();
  return { status: response.status, data: json.data, error: json.error?.code,
    cookie: response.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ") };
}

async function testSeats() {
  assert.equal(process.env.APP_ENV, "staging");
  const [database] = await db.$queryRaw`SELECT current_database() AS name`;
  assert.equal(database.name, "lemuria_staging");
  const location = await db.location.findFirst({ where: { slug: "saratov", park: "LEMURIA", status: "ACTIVE" } });
  assert.ok(location, "staging location");
  const date = (time) => new Intl.DateTimeFormat("en-CA", { timeZone: location.timezone }).format(time);
  const now = Date.now();
  // Use a future time distinct from regularly generated half-hour sessions.
  const start = new Date(Math.ceil((now + 5 * 60000) / 1800000) * 1800000 + 137000);
  assert.equal(date(start), date(new Date(now)), "local staging day");
  const password = randomBytes(32).toString("base64url");
  let user, shift, session, reservation, order;
  try {
    user = await db.user.create({ data: {
      name: "Synthetic seat availability QA", email: `qa-seats-${randomUUID()}@example.invalid`,
      passwordHash: await bcrypt.hash(password, 12), role: "CASHIER", status: "ACTIVE",
      locations: { create: { locationId: location.id } },
    } });
    const login = await request("/api/auth/login", { body: { email: user.email, password, portal: "cashier" } });
    assert.equal(login.status, 200, login.error);
    assert.ok(login.cookie);
    shift = await db.cashierShift.create({ data: {
      userId: user.id, locationId: location.id, status: "OPEN", openingCashAmount: 0, notes: "Staging seat QA",
    } });
    session = await db.session.create({ data: {
      locationId: location.id, park: location.park, startsAt: start, endsAt: new Date(+start + 1200000),
      capacity: 2, status: "SCHEDULED",
    } });
    const seats = async (expected) => {
      const [website, cashier] = await Promise.all([
        request(`/api/public/sessions?locationSlug=saratov&date=${date(start)}`),
        request("/api/cashier/sessions", { cookie: login.cookie }),
      ]);
      assert.equal(website.status, 200, website.error);
      assert.equal(cashier.status, 200, cashier.error);
      assert.equal(website.data.sessions.find((item) => item.publicId === session.publicId)?.remainingSeats,
        expected, "website seats");
      assert.equal(cashier.data.sessions.find((item) => item.publicId === session.publicId)?.remaining,
        expected, "cashier seats");
    };
    const selection = { sessionPublicId: session.publicId, items: [{ ticketTypeCode: "ADULT", quantity: 1 }] };
    await seats(2);
    const hold = await request("/api/public/reservations", { body: selection, key: randomUUID() });
    assert.ok([200, 201].includes(hold.status), hold.error);
    reservation = hold.data.publicId;
    await seats(1);

    const quote = await request("/api/cashier/quote", { body: selection, cookie: login.cookie });
    assert.equal(quote.status, 200, quote.error);
    const sale = await request("/api/cashier/sales", { cookie: login.cookie, key: randomUUID(),
      body: { ...selection, paymentMethod: "CASH", quoteFingerprint: quote.data.fingerprint,
        adultCompanionConfirmed: true } });
    assert.ok([200, 201].includes(sale.status), sale.error);
    order = sale.data.number;
    await seats(0);
    const blocked = await request("/api/public/reservations", { body: selection, key: randomUUID() });
    assert.ok(["SESSION_SOLD_OUT", "INSUFFICIENT_CAPACITY"].includes(blocked.error), blocked.error);

    await db.session.update({ where: { id: session.id }, data: {
      startsAt: new Date(Date.now() - 45 * 60000), endsAt: new Date(Date.now() - 25 * 60000),
    } });
    const past = await request("/api/cashier/quote", { body: selection, cookie: login.cookie });
    assert.equal(past.error, "SESSION_NOT_AVAILABLE");
    return { ok: true, website: [2, 1, 0], cashier: [2, 1, 0], fullBlocked: true, pastBlocked: true };
  } finally {
    if (session) await db.session.update({ where: { id: session.id }, data: { status: "CANCELLED" } });
    if (reservation) await db.reservation.updateMany({ where: { publicId: reservation }, data: { status: "EXPIRED", expiresAt: new Date() } });
    if (order) {
      const created = await db.order.findUnique({ where: { number: order } });
      if (created) {
        await db.ticket.updateMany({ where: { orderId: created.id }, data: { status: "CANCELLED" } });
        await db.order.update({ where: { id: created.id }, data: { status: "CANCELLED" } });
      }
    }
    if (shift) await db.cashierShift.update({ where: { id: shift.id }, data: { status: "CLOSED", closedAt: new Date(),
      closingCashAmount: 0, expectedCashAmount: 0, cashDifferenceAmount: 0 } });
    if (user) {
      await db.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
      await db.staffSession.deleteMany({ where: { userId: user.id } });
    }
  }
}

http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.url !== "/test" || req.method !== "POST") {
    res.writeHead(404).end("{}");
    return;
  }
  try {
    res.end(JSON.stringify(await testSeats()));
  } catch (error) {
    res.writeHead(500).end(JSON.stringify({ ok: false, error: error.code || error.name,
      message: error.name === "AssertionError" ? error.message : undefined }));
  }
}).listen(Number(process.env.PORT || 8080), "0.0.0.0");
