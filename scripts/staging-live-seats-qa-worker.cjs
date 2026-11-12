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
  const path = `/api/public/sessions?locationSlug=saratov&date=${date(new Date(now))}`;
  const password = randomBytes(32).toString("base64url");
  let user, shift, reservation, order;
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
    const [published, pointOfSale] = await Promise.all([
      request(path), request("/api/cashier/sessions", { cookie: login.cookie }),
    ]);
    assert.equal(published.status, 200, published.error);
    assert.equal(pointOfSale.status, 200, pointOfSale.error);
    const salesSessions = new Map(pointOfSale.data.sessions.map((item) => [item.publicId, item.remaining]));
    const session = published.data.sessions.find((item) =>
      Date.parse(item.startsAt) > now + 5 * 60000 &&
      item.remainingSeats >= 2 && salesSessions.get(item.publicId) === item.remainingSeats);
    assert.ok(session, "published staging session with matching availability");
    const before = session.remainingSeats;
    const seats = async (expected) => {
      const [website, cashier] = await Promise.all([
        request(path),
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
    await seats(before);
    const hold = await request("/api/public/reservations", { body: selection, key: randomUUID() });
    assert.ok([200, 201].includes(hold.status), hold.error);
    reservation = hold.data.publicId;
    await seats(before - 1);

    const quote = await request("/api/cashier/quote", { body: selection, cookie: login.cookie });
    assert.equal(quote.status, 200, quote.error);
    const sale = await request("/api/cashier/sales", { cookie: login.cookie, key: randomUUID(),
      body: { ...selection, paymentMethod: "CASH", quoteFingerprint: quote.data.fingerprint,
        adultCompanionConfirmed: true } });
    assert.ok([200, 201].includes(sale.status), sale.error);
    order = sale.data.number;
    await seats(before - 2);
    const pastSession = published.data.sessions.find((item) => Date.parse(item.startsAt) < now - 60 * 60000);
    assert.ok(pastSession, "past published staging session");
    const past = await request("/api/cashier/quote", {
      body: { ...selection, sessionPublicId: pastSession.publicId }, cookie: login.cookie,
    });
    assert.equal(past.error, "SESSION_NOT_AVAILABLE");
    const availability = [before, before - 1, before - 2];
    return { ok: true, website: availability, cashier: availability, pastBlocked: true };
  } finally {
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
