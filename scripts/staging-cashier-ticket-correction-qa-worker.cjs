"use strict";

const assert = require("node:assert/strict");
const { randomBytes, randomInt, randomUUID } = require("node:crypto");
const http = require("node:http");
require("/app/container-bootstrap.cjs").applyDatabaseUrlFromEnv(process.env);
const { PrismaClient } = require("/app/node_modules/@prisma/client");
const bcrypt = require("/app/node_modules/bcryptjs");
const db = new PrismaClient({ log: [] });
const origin = "https://d5d9sorlbdsebnpfr97f.0ly8ed4d.apigw.yandexcloud.net";

async function request(path, { cookie, body, key, expected = 200 } = {}) {
  const response = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { "Idempotency-Key": key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  const result = await response.json();
  assert.equal(response.status, expected, path + " " + (result.error?.code ?? ""));
  return { data: result.data, cookie: response.headers.getSetCookie().map((header) => header.split(";")[0]).join("; ") };
}

async function run() {
  assert.equal(process.env.APP_ENV, "staging");
  const [database] = await db.$queryRaw`SELECT current_database() AS name`;
  assert.equal(database.name, "lemuria_staging");
  const location = await db.location.findFirstOrThrow({ where: { slug: "saratov", park: "LEMURIA", status: "ACTIVE" } });
  let user, shift, session, order;
  try {
    const password = randomBytes(32).toString("base64url");
    user = await db.user.create({ data: {
      name: "Synthetic ticket correction QA", email: "qa-correction-" + randomUUID() + "@example.invalid",
      passwordHash: await bcrypt.hash(password, 12), role: "CASHIER", status: "ACTIVE",
      locations: { create: { locationId: location.id } },
    } });
    const { cookie } = await request("/api/auth/login", { body: { email: user.email, password, portal: "cashier" } });
    assert.ok(cookie);
    shift = await db.cashierShift.create({ data: {
      userId: user.id, locationId: location.id, status: "OPEN", openingCashAmount: 0,
    } });
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    date.setUTCHours(14, 30, randomInt(1, 60), randomInt(1, 1000));
    session = await db.session.create({ data: {
      locationId: location.id, park: location.park, startsAt: date, endsAt: new Date(+date + 20 * 60_000),
      capacity: 2, status: "SCHEDULED",
    } });
    const selection = { sessionPublicId: session.publicId, items: [{ ticketTypeCode: "CHILD", quantity: 2 }] };
    const quote = await request("/api/cashier/quote", { cookie, body: selection });
    const sale = await request("/api/cashier/sales", { cookie, key: randomUUID(), expected: 201,
      body: { ...selection, paymentMethod: "CASH", quoteFingerprint: quote.data.fingerprint, adultCompanionConfirmed: true } });
    order = await db.order.findUniqueOrThrow({ where: { number: sale.data.number }, include: { tickets: true } });
    const path = "/api/cashier/orders/" + order.number;
    const detail = (await request(path, { cookie })).data.order;
    assert.ok(detail.tickets.every((ticket) => ticket.canCorrect));
    const ticket = order.tickets[0];
    const body = { action: "preview", ticketId: ticket.publicId };
    const { data: preview } = await request(path, { cookie, body });
    assert.notEqual(preview.before, preview.after);
    assert.equal(preview.delta, preview.newAmount - preview.oldAmount);
    await request(path, { cookie, body: { ...body, action: "confirm", version: preview.version }, expected: 400 });
    const fn = "00" + randomBytes(7).toString("hex").replace(/[a-f]/g, "2");
    const command = { ...body, action: "confirm", version: preview.version,
      originalDocument: fn + "/1", correctionDocument: fn + "/2", settled: true };
    const { data: corrected } = await request(path, { cookie, body: command });
    assert.deepEqual((await request(path, { cookie, body: command })).data, corrected);
    const result = await db.order.findUniqueOrThrow({
      where: { id: order.id }, include: { payments: true, items: true, tickets: { include: { ticketType: true } } },
    });
    assert.equal(result.totalAmount, order.totalAmount + preview.delta);
    assert.equal(result.payments[0].amount, result.totalAmount);
    assert.deepEqual(result.items.map((item) => item.quantity), [1, 1]);
    assert.equal(result.tickets.find((row) => row.id === ticket.id).ticketType.code, "ADULT");
    assert.equal(result.tickets.find((row) => row.id === ticket.id).qrToken, ticket.qrToken);
    assert.equal(result.tickets.length, 2);
    const { data } = await request("/api/cashier/shift", { cookie });
    assert.equal(data.shift.currentCashBalance, result.totalAmount);
    assert.equal(data.shift.businessReport.products.tickets.total, result.totalAmount);
    assert.equal(await db.auditLog.count({ where: { action: "CASHIER_TICKET_CORRECTED", entityId: order.id } }), 1);
    return { ok: true, ticketCount: 2, reconciled: true };
  } finally {
    if (user) {
      await db.staffSession.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
      await db.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
    }
    if (order) {
      await db.ticket.updateMany({ where: { orderId: order.id }, data: { status: "CANCELLED" } });
      await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    }
    if (session) await db.session.update({ where: { id: session.id }, data: { status: "CANCELLED" } });
    if (shift) await db.cashierShift.update({ where: { id: shift.id }, data: { closedAt: new Date(), status: "CLOSED" } });
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
