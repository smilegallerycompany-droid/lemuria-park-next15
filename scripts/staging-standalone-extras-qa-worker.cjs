"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const { PrismaClient } = require("/app/node_modules/@prisma/client");
const bcrypt = require("/app/node_modules/bcryptjs");
const db = new PrismaClient({ log: [] });
const ORIGIN = "https://d5d9sorlbdsebnpfr97f.0ly8ed4d.apigw.yandexcloud.net";

async function request(path, { cookie, body, method } = {}) {
  const response = await fetch(ORIGIN + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.getSetCookie().map((header) => header.split(";")[0]).join("; "),
  };
}

function ok(response, status = 201) {
  assert.equal(response.status, status, response.body?.error?.code ?? "unexpected response");
  return response.body.data;
}

async function run() {
  assert.equal(process.env.APP_ENV, "staging");
  const [database] = await db.$queryRawUnsafe("SELECT current_database() AS name");
  assert.equal(database.name, "lemuria_staging");
  const location = await db.location.findFirst({ where: { slug: "saratov", park: "LEMURIA", status: "ACTIVE" } });
  assert.ok(location);
  const catalog = await db.cashierExtra.findMany({
    where: { code: { in: ["FEED", "PHOTO"] }, isActive: true },
  });
  const price = Object.fromEntries(catalog.map((product) => [product.code, product.unitPriceAmount]));
  assert.ok(price.FEED > 0 && price.PHOTO > 0);
  let user, shift;
  let phase = "login";
  const saleIds = [];
  try {
    const password = crypto.randomBytes(32).toString("base64url");
    user = await db.user.create({
      data: {
        name: "Synthetic product sale QA",
        email: "qa-standalone-" + crypto.randomUUID() + "@example.invalid",
        passwordHash: await bcrypt.hash(password, 12),
        role: "CASHIER",
        status: "ACTIVE",
        locations: { create: { locationId: location.id } },
      },
    });
    const login = await request("/api/auth/login", { body: { email: user.email, password, portal: "cashier" } });
    assert.equal(login.status, 200);
    assert.ok(login.cookie);
    shift = await db.cashierShift.create({
      data: { userId: user.id, locationId: location.id, status: "OPEN", openingCashAmount: 0 },
    });
    const submit = (body) => request("/api/cashier/shift/entries", { cookie: login.cookie, body });
    const input = (code, method, quantity) => ({
      id: crypto.randomUUID(), shiftId: shift.id, kind: code + "_SALE",
      quantity, method, amountKopecks: price[code] * quantity, person: "", note: "Продажа без билета",
    });
    const feed = input("FEED", "CASH", 2);
    const photo = input("PHOTO", "CARD", 1);
    saleIds.push(feed.id, photo.id);

    phase = "reject altered price";
    const wrong = await submit({ ...photo, amountKopecks: photo.amountKopecks + 1 });
    assert.equal(wrong.body?.error?.code, "PRICE_NOT_CONFIGURED");
    assert.equal(await db.parkOperation.count({ where: { id: photo.id } }), 0);

    phase = "record both payment types and retry";
    for (const entry of [feed, photo, feed, photo]) ok(await submit(entry));
    const operations = await db.parkOperation.findMany({ where: { id: { in: saleIds }, shiftId: shift.id } });
    assert.equal(operations.length, 2);
    assert.ok(operations.some((operation) => operation.kind === "FEED_SALE" && operation.quantity === 2));
    assert.ok(operations.some((operation) => operation.kind === "PHOTO_SALE" && operation.quantity === 1));
    const deposits = await db.cashOperation.findMany({ where: { shiftId: shift.id } });
    assert.equal(deposits.length, 1);
    assert.equal(deposits[0].type, "IN");
    assert.equal(deposits[0].amount, feed.amountKopecks);
    assert.equal(await db.order.count({ where: { shiftId: shift.id } }), 0);

    phase = "read report and expected drawer";
    const shiftData = ok(await request("/api/cashier/shift", { cookie: login.cookie }), 200).shift;
    assert.equal(shiftData.currentCashBalance, feed.amountKopecks);
    assert.equal(shiftData.businessReport.products.feed.cash, feed.amountKopecks);
    assert.equal(shiftData.businessReport.products.photo.card, photo.amountKopecks);
    assert.equal(shiftData.businessReport.total.total, feed.amountKopecks + photo.amountKopecks);
    assert.equal(shiftData.businessReport.products.tickets.total, 0);
    assert.equal(shiftData.businessReport.commissions.base, feed.amountKopecks + photo.amountKopecks);
    return { ok: true, separateSales: 2, drawerEntries: 1, orderCount: 0, duplicateWrites: 0, reportCorrect: true };
  } catch (error) {
    throw new Error(phase + ": " + error.message);
  } finally {
    if (shift) {
      await db.cashOperation.deleteMany({ where: { shiftId: shift.id, parkOperationId: { in: saleIds } } });
      await db.parkOperation.updateMany({
        where: { shiftId: shift.id, id: { in: saleIds } }, data: { cancelledAt: new Date(), cancelledBy: user.id },
      });
      await db.cashierShift.update({
        where: { id: shift.id },
        data: { status: "CLOSED", closedAt: new Date(), closingCashAmount: 0, expectedCashAmount: 0, cashDifferenceAmount: 0 },
      });
    }
    if (user) {
      await db.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
      await db.staffSession.deleteMany({ where: { userId: user.id } });
    }
  }
}

http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
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
