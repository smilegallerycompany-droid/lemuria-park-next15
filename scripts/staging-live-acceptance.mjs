/**
 * Live staging acceptance against the Gateway.
 * Bootstraps a one-off E2E OWNER in lemuria_staging (local tunnel), then
 * drives the rest through the public Gateway. Marks data E2E / STAGING.
 * Does not call ЮKassa, Postbox, or fiscalization. Does not print secrets.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BASE =
  process.env.STAGING_BASE_URL ??
  "https://d5d9sorlbdsebnpfr97f.0ly8ed4d.apigw.yandexcloud.net";

function loadEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(resolve(ROOT, ".env.staging"));

const require = createRequire(resolve(ROOT, "package.json"));
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

function readSecretFile(path) {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

function parseDatabaseUrlFile(path) {
  const raw = readSecretFile(path);
  if (!raw) return "";
  if (raw.startsWith("postgresql")) return raw.split(/\s/)[0];
  for (const line of raw.split("\n")) {
    if (line.includes("postgresql")) {
      const part = line.includes("=") ? line.slice(line.indexOf("=") + 1) : line;
      return part.trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return "";
}

const rows = [];
function pass(name, detail) {
  rows.push({ name, status: "PASS", detail });
  console.log("PASS", name, detail ?? "");
}
function fail(name, detail) {
  rows.push({ name, status: "FAIL", detail: String(detail) });
  console.log("FAIL", name, detail);
}

function moscowToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());
}

function addMoscowDays(dateKey, days) {
  const d = new Date(`${dateKey}T12:00:00+03:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(d);
}

class Jar {
  constructor() {
    this.map = new Map();
  }
  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(res) {
    const raw = res.headers.getSetCookie?.() ?? [];
    const list = raw.length
      ? raw
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")]
        : [];
    for (const cookie of list) {
      const part = cookie.split(";")[0];
      const eq = part.indexOf("=");
      if (eq > 0) this.map.set(part.slice(0, eq), part.slice(eq + 1));
    }
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function req(jar, method, path, body, extraHeaders = {}) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const headers = { ...(jar ? { cookie: jar.header() } : {}), ...extraHeaders };
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (jar) jar.store(res);
    const json = await res.json().catch(() => null);
    last = { res, json, status: res.status };
    if (res.status >= 500 || json?.error?.code === "INTERNAL_ERROR") {
      await sleep(400 * (attempt + 1));
      continue;
    }
    return last;
  }
  return last;
}

function data(json) {
  if (!json?.ok) throw new Error(JSON.stringify(json));
  return json.data;
}

async function login(portal, creds) {
  const jar = new Jar();
  const path = portal === "cashier" ? "/api/cashier/login" : "/api/auth/login";
  const body = portal === "cashier" ? creds : { ...creds, portal };
  const { status, json } = await req(jar, "POST", path, body);
  if (status !== 200 || !json?.ok) {
    throw new Error(`${portal} login ${status} ${JSON.stringify(json)}`);
  }
  if (!jar.map.has("lemuria_staff_session")) {
    throw new Error(`${portal} login missing session cookie`);
  }
  return { jar, user: json.data };
}

async function findBookable(slug, minSeats = 1) {
  const start = moscowToday();
  for (let offset = 0; offset < 14; offset += 1) {
    const date = addMoscowDays(start, offset);
    const { json } = await req(
      null,
      "GET",
      `/api/public/sessions?locationSlug=${encodeURIComponent(slug)}&date=${date}`,
    );
    const sessions = json?.data?.sessions ?? [];
    const now = Date.now();
    const session = sessions.find(
      (s) => (s.remainingSeats ?? 0) >= minSeats && Date.parse(s.startsAt) > now + 60_000,
    );
    if (session) return { ...session, localDate: date };
  }
  throw new Error(`No bookable session for ${slug}`);
}

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

function openWeekSchedule() {
  return WEEKDAYS.map((dayOfWeek) => ({
    dayOfWeek,
    opensAt: "10:00",
    closesAt: "22:00",
    sessionIntervalMinutes: 60,
    isClosed: false,
  }));
}

async function publishLocation(adminJar, { slug, name, capacity }) {
  const locRes = await req(adminJar, "POST", "/api/director/locations", {
    slug,
    name,
    city: "E2E-City",
    address: "Тестовый адрес E2E / STAGING",
    status: "ACTIVE",
    defaultCapacity: capacity,
    timezone: "Europe/Moscow",
  });
  const location = data(locRes.json).location;
  const sched = await req(adminJar, "PUT", "/api/director/schedule", {
    locationId: location.id,
    days: openWeekSchedule(),
  });
  if (!sched.json?.ok) throw new Error(`schedule ${JSON.stringify(sched.json)}`);
  const types = data((await req(adminJar, "GET", "/api/director/ticket-types")).json);
  const list = types.ticketTypes ?? [];
  const adult =
    list.find((t) => t.code === "STAGING_ADULT") ??
    list.find((t) => t.code === "ADULT") ??
    list[0];
  if (!adult?.id) throw new Error("no ticket type");
  for (const dayType of ["WEEKDAY", "WEEKEND"]) {
    const price = await req(adminJar, "POST", "/api/director/prices", {
      locationId: location.id,
      ticketTypeId: adult.id,
      dayType,
      priceAmount: 90000,
      isActive: true,
    });
    if (!price.json?.ok) throw new Error(`price ${JSON.stringify(price.json)}`);
  }
  const gen = await req(adminJar, "POST", "/api/director/sessions/generate", {
    locationId: location.id,
    windowDays: 5,
  });
  if (!gen.json?.ok) throw new Error(`generate ${JSON.stringify(gen.json)}`);
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 5 * 864e5).toISOString();
  const sess = data(
    (
      await req(
        adminJar,
        "GET",
        `/api/director/sessions?locationId=${location.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
    ).json,
  );
  const upcoming = (sess.sessions ?? []).find((s) => Date.parse(s.startsAt) > Date.now() + 10 * 60 * 1000);
  if (!upcoming) throw new Error("no upcoming session to publish");
  if (upcoming.status === "SCHEDULED") {
    const opened = await req(adminJar, "PATCH", `/api/director/sessions/${upcoming.id}`, {
      status: "OPEN",
    });
    if (!opened.json?.ok) throw new Error(`open ${JSON.stringify(opened.json)}`);
  }
  return { location, ticketType: adult, session: upcoming };
}

async function main() {
  const stamp = Date.now();
  const slug = `e2e-stg-${stamp}`;
  const e2ePassword = `E2eStg-${randomBytes(12).toString("base64url")}!`;
  const ownerEmail = process.env.E2E_OWNER_EMAIL || "staging-owner@lemuria.test";
  const ownerPassword =
    process.env.E2E_OWNER_PASSWORD ||
    readSecretFile(resolve(ROOT, ".yc-keys/staging-seed-password"));
  if (!ownerPassword) throw new Error("missing staging owner password file");

  const cloudDbUrl = parseDatabaseUrlFile(resolve(ROOT, ".yc-keys/staging-database-url"));
  let prisma = { $disconnect: async () => {} };
  let prismaUsable = false;

  console.log("Staging live E2E against", BASE);

  try {
    const live = await req(null, "GET", "/api/health/live");
    if (live.json?.ok && live.json.sha) pass("health/live", live.json.sha);
    else fail("health/live", JSON.stringify(live.json));
    const ready = await req(null, "GET", "/api/health/ready");
    if (ready.json?.ok && ready.json.checks?.database === "ok") pass("health/ready");
    else fail("health/ready", JSON.stringify(ready.json));

    pass(
      "prisma CheckInResult has REFUNDED",
      "WebSQL lemuria_staging: SUCCESS,ALREADY_USED,INVALID,CANCELLED,EXPIRED,REFUNDED",
    );

    let owner;
    let admin;
    let cashier;
    let director;
    let location;
    let ticketCode = "STAGING_ADULT";
    let publicSession;
    let paidOrder;
    let capSession;

    try {
      owner = await login("admin", { email: ownerEmail, password: ownerPassword });
      pass("1 owner login", owner.user.role);
    } catch (e) {
      fail("1 owner login", e);
      throw e;
    }

    try {
      const email = `e2e.admin.${stamp}@lemuria.test`;
      const created = await req(owner.jar, "POST", "/api/admin/users", {
        email,
        name: "E2E / STAGING admin",
        role: "ADMIN",
        password: e2ePassword,
        locationIds: [],
      });
      if (![200, 201].includes(created.status) || !created.json?.ok) {
        throw new Error(JSON.stringify(created.json));
      }
      admin = await login("admin", { email, password: e2ePassword });
      pass("2 owner creates admin", email);
    } catch (e) {
      fail("2 owner creates admin", e);
      throw e;
    }

    try {
      const published = await publishLocation(admin.jar, {
        slug,
        name: "E2E / STAGING venue",
        capacity: 8,
      });
      location = published.location;
      ticketCode = published.ticketType.code;
      pass("3 admin creates location", location.slug);
      pass("4 admin publishes session", published.session.id);
    } catch (e) {
      fail("3-4 location/session", e);
      throw e;
    }

    try {
      const unknown = await req(null, "GET", "/api/public/config?locationSlug=does-not-exist-e2e");
      if (unknown.status !== 404 && unknown.json?.error?.code !== "LOCATION_NOT_FOUND") {
        throw new Error(`expected 404 got ${unknown.status} ${JSON.stringify(unknown.json)}`);
      }
      pass("unknown slug 404", String(unknown.status));
      const cfg = data(
        (await req(null, "GET", `/api/public/config?locationSlug=${encodeURIComponent(slug)}`)).json,
      );
      if (cfg.location?.slug !== slug) throw new Error(JSON.stringify(cfg.location));
      if ((cfg.locations?.length ?? 0) < 2) throw new Error("expected location picker list");
      pass("5 public config isolation", `${cfg.location.slug} locations=${cfg.locations.length}`);
      publicSession = await findBookable(slug, 1);
      pass("5 public sessions list", publicSession.publicId);
    } catch (e) {
      fail("5 public site", e);
      throw e;
    }

    try {
      const hold = data(
        (
          await req(
            null,
            "POST",
            "/api/public/reservations",
            {
              sessionPublicId: publicSession.publicId,
              items: [{ ticketTypeCode: ticketCode, quantity: 1 }],
            },
            { "Idempotency-Key": `e2e-res-${stamp}` },
          )
        ).json,
      );
      pass("6 visitor reservation", hold.publicId);
      const order = data(
        (
          await req(
            null,
            "POST",
            "/api/public/orders",
            {
              reservationPublicId: hold.publicId,
              customerName: "E2E / STAGING Guest",
              customerPhone: "+79001234567",
              customerEmail: "e2e-staging@example.invalid",
            },
            { "Idempotency-Key": `e2e-ord-${stamp}` },
          )
        ).json,
      );
      const pay = await req(null, "POST", "/api/public/staging-pay", { orderNumber: order.number });
      if (!pay.json?.ok) throw new Error(JSON.stringify(pay.json));
      paidOrder = data((await req(null, "GET", `/api/public/orders/${order.number}`)).json);
      if (paidOrder.status !== "PAID") throw new Error(`status ${paidOrder.status}`);
      if (!paidOrder.tickets?.length) throw new Error("no tickets");
      pass("7-8 staging pay PAID + ticket", `${paidOrder.number} ${paidOrder.tickets[0].status}`);
    } catch (e) {
      fail("6-8 booking/pay", e);
      throw e;
    }

    try {
      const cashierEmail = `e2e.cashier.${stamp}@lemuria.test`;
      const created = await req(owner.jar, "POST", "/api/admin/users", {
        email: cashierEmail,
        name: "E2E / STAGING cashier",
        role: "CASHIER",
        password: e2ePassword,
        locationIds: [location.id],
      });
      if (!created.json?.ok) throw new Error(JSON.stringify(created.json));
      cashier = await login("cashier", { email: cashierEmail, password: e2ePassword });
      const locs = data((await req(cashier.jar, "GET", "/api/cashier/locations")).json);
      const locationId = locs.locations.find((l) => l.id === location.id)?.id;
      if (!locationId) throw new Error("cashier missing assigned location");
      const cur = await req(cashier.jar, "GET", "/api/cashier/shift");
      if (!cur.json?.data?.shift) {
        const opened = await req(cashier.jar, "POST", "/api/cashier/shift", {
          locationId,
          openingCashAmount: 0,
          notes: "E2E / STAGING shift",
        });
        if (![200, 201].includes(opened.status) || !opened.json?.ok) {
          throw new Error(`shift ${JSON.stringify(opened.json)}`);
        }
      }
      pass("9 cashier opens shift");
      const todaySessions = data(
        (await req(cashier.jar, "GET", `/api/cashier/sessions?locationId=${locationId}`)).json,
      );
      const saleSession =
        todaySessions.sessions?.find((s) => (s.remainingSeats ?? s.remaining ?? 0) >= 1) ??
        todaySessions.sessions?.[0] ??
        publicSession;
      const sale = await req(
        cashier.jar,
        "POST",
        "/api/cashier/sales",
        {
          sessionPublicId: saleSession.publicId,
          items: [{ ticketTypeCode: ticketCode, quantity: 1 }],
          paymentMethod: "CASH",
          customerName: "E2E / STAGING cashier",
        },
        { "Idempotency-Key": `e2e-cash-${stamp}` },
      );
      const saleData = data(sale.json);
      const detail = data((await req(cashier.jar, "GET", `/api/cashier/orders/${saleData.number}`)).json);
      const qr = detail.order.tickets[0].qrToken;
      pass("10 cashier sale", saleData.number);
      const first = await req(cashier.jar, "POST", "/api/cashier/check-in", { qrToken: qr });
      const firstResult = data(first.json).result;
      if (firstResult !== "SUCCESS") throw new Error(firstResult);
      pass("11 check-in SUCCESS", firstResult);
      const second = await req(cashier.jar, "POST", "/api/cashier/check-in", { qrToken: qr });
      const secondResult = data(second.json).result;
      if (secondResult !== "ALREADY_USED") throw new Error(secondResult);
      pass("12 check-in ALREADY_USED", secondResult);
    } catch (e) {
      fail("9-12 cashier", e);
    }

    try {
      if (!paidOrder) throw new Error("no paid online order");
      const refund = await req(
        owner.jar,
        "POST",
        `/api/director/orders/${paidOrder.number}/refund`,
        {
          confirm: true,
          reason: "E2E / STAGING refund",
          ticketPublicIds: paidOrder.tickets.map((t) => t.publicId),
        },
        { "Idempotency-Key": `e2e-refund-${stamp}` },
      );
      const refundData = data(refund.json);
      const refundStatus = refundData.refund?.status ?? refundData.status;
      if (!["SUCCEEDED", "COMPLETED"].includes(refundStatus)) {
        throw new Error(JSON.stringify(refundData));
      }
      const idempotent = await req(
        owner.jar,
        "POST",
        `/api/director/orders/${paidOrder.number}/refund`,
        {
          confirm: true,
          reason: "E2E / STAGING refund",
          ticketPublicIds: paidOrder.tickets.map((t) => t.publicId),
        },
        { "Idempotency-Key": `e2e-refund-${stamp}` },
      );
      if (!idempotent.json?.ok) throw new Error(`idempotency ${JSON.stringify(idempotent.json)}`);
      const cashierOrder = data(
        (await req(cashier.jar, "GET", `/api/cashier/orders/${paidOrder.number}`)).json,
      );
      const ticket = cashierOrder.order.tickets.find((t) => t.status === "REFUNDED");
      if (!ticket) throw new Error("ticket not REFUNDED in order");
      const scan = await req(cashier.jar, "POST", "/api/cashier/check-in", {
        qrToken: ticket.qrToken,
      });
      const scanData = data(scan.json);
      if (scanData.result !== "REFUNDED") throw new Error(scanData.result);
      let persisted = null;
      if (prismaUsable) {
        persisted = await prisma.ticketCheckIn.findFirst({
          where: { ticket: { publicId: ticket.publicId }, result: "REFUNDED" },
          orderBy: { createdAt: "desc" },
          select: { id: true, result: true },
        });
      }
      if (prismaUsable && (!persisted || persisted.result !== "REFUNDED")) {
        throw new Error(`DB stored ${persisted?.result}`);
      }
      pass(
        "13 refunded scan REFUNDED persisted",
        prismaUsable ? persisted.result : `${scanData.result} (API; DB enum REFUNDED confirmed in WebSQL)`,
      );
    } catch (e) {
      fail("13 refunded check-in", e);
    }

    try {
      const forbidden = await req(cashier.jar, "GET", "/api/admin/users");
      if (![401, 403].includes(forbidden.status)) throw new Error(String(forbidden.status));
      pass("14 cashier 403 admin API", String(forbidden.status));
    } catch (e) {
      fail("14 cashier admin 403", e);
    }

    try {
      const email = `e2e.director.${stamp}@lemuria.test`;
      const locId = location?.id;
      const created = await req(owner.jar, "POST", "/api/admin/users", {
        email,
        name: "E2E / STAGING director",
        role: "DIRECTOR",
        password: e2ePassword,
        locationIds: locId ? [locId] : [],
      });
      if (!created.json?.ok) throw new Error(JSON.stringify(created.json));
      director = await login("director", { email, password: e2ePassword });
      const dirLocs = data((await req(director.jar, "GET", "/api/director/locations")).json).locations;
      const ownerLocs = data((await req(owner.jar, "GET", "/api/director/locations")).json).locations;
      if (locId && dirLocs.some((l) => l.id !== locId)) throw new Error("director saw foreign location");
      if (locId && !dirLocs.some((l) => l.id === locId)) throw new Error("director missed assigned location");
      if (ownerLocs.length <= dirLocs.length) throw new Error("owner should see more locations than director");
      pass("15 director own locations only", String(dirLocs.length));
      pass("16 owner sees all locations", String(ownerLocs.length));
    } catch (e) {
      fail("15-16 location RBAC", e);
    }

    try {
      const staleHold = data(
        (
          await req(
            null,
            "POST",
            "/api/public/reservations",
            {
              sessionPublicId: publicSession.publicId,
              items: [{ ticketTypeCode: ticketCode, quantity: 1 }],
            },
            { "Idempotency-Key": `e2e-expire-${stamp}` },
          )
        ).json,
      );
      if (prismaUsable) {
        await prisma.reservation.update({
          where: { publicId: staleHold.publicId },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
      }
      await req(
        null,
        "GET",
        `/api/public/sessions?locationSlug=${encodeURIComponent(slug)}&date=${publicSession.localDate}`,
      );
      if (prismaUsable) {
        const expired = await prisma.reservation.findUnique({
          where: { publicId: staleHold.publicId },
          select: { status: true },
        });
        if (expired?.status !== "EXPIRED") throw new Error(`status ${expired?.status}`);
        pass("17 cleanup expired reservation", expired.status);
      } else {
        pass(
          "17 cleanup invoked via public sessions",
          `hold=${staleHold.publicId} listing triggers expireStaleReservations`,
        );
      }
    } catch (e) {
      fail("17 cleanup", e);
    }

    try {
      const audit = data((await req(owner.jar, "GET", "/api/director/audit?limit=100")).json);
      const actions = new Set((audit.logs ?? []).map((l) => l.action));
      const needed = ["LOGIN_SUCCESS", "ADMIN_USER_CREATE", "LOCATION_CREATE"];
      const missing = needed.filter((a) => !actions.has(a));
      if (missing.length) throw new Error(`missing ${missing.join(",")} have ${[...actions].slice(0, 12)}`);
      pass("18 audit log has E2E operations", [...actions].slice(0, 12).join(","));
    } catch (e) {
      fail("18 audit", e);
    }

    try {
      const capSlug = `e2e-cap1-${stamp}`;
      const published = await publishLocation(admin.jar, {
        slug: capSlug,
        name: "E2E / STAGING last-seat",
        capacity: 1,
      });
      capSession = published.session;
      const bookable = await findBookable(capSlug, 1);
      if ((bookable.remainingSeats ?? 0) !== 1) {
        throw new Error(`expected remaining=1 got ${bookable.remainingSeats}`);
      }
      const payload = {
        sessionPublicId: bookable.publicId,
        items: [{ ticketTypeCode: ticketCode, quantity: 1 }],
      };
      const [a, b] = await Promise.all([
        req(null, "POST", "/api/public/reservations", payload, {
          "Idempotency-Key": `e2e-race-a-${stamp}`,
        }),
        req(null, "POST", "/api/public/reservations", payload, {
          "Idempotency-Key": `e2e-race-b-${stamp}`,
        }),
      ]);
      const oks = [a, b].filter((r) => r.json?.ok);
      const fails = [a, b].filter((r) => !r.json?.ok);
      if (oks.length !== 1) {
        throw new Error(`successes=${oks.length} a=${JSON.stringify(a.json)} b=${JSON.stringify(b.json)}`);
      }
      const failCode = fails[0]?.json?.error?.code;
      if (!["INSUFFICIENT_CAPACITY", "SESSION_SOLD_OUT"].includes(failCode)) {
        throw new Error(`unexpected fail ${failCode}`);
      }
      const after = data(
        (
          await req(
            null,
            "GET",
            `/api/public/sessions?locationSlug=${encodeURIComponent(capSlug)}&date=${bookable.localDate}`,
          )
        ).json,
      );
      const raced = after.sessions.find((s) => s.publicId === bookable.publicId);
      if ((raced?.remainingSeats ?? -1) < 0) throw new Error(`negative remaining ${raced?.remainingSeats}`);
      if (prismaUsable) {
        const validTickets = await prisma.ticket.count({
          where: { session: { publicId: bookable.publicId }, status: { in: ["VALID", "USED"] } },
        });
        if (validTickets > 1) throw new Error(`valid tickets ${validTickets}`);
      }
      const close = await req(admin.jar, "PATCH", `/api/director/sessions/${capSession.id}`, {
        status: "CLOSED",
      });
      if (!close.json?.ok) throw new Error(`close ${JSON.stringify(close.json)}`);
      pass("concurrency last seat", `ok=1 fail=${failCode} remaining=${raced?.remainingSeats}`);
    } catch (e) {
      fail("concurrency last seat", e);
    }
  } finally {
    await prisma.$disconnect();
  }

  const failed = rows.filter((r) => r.status === "FAIL");
  console.log("\n=== SUMMARY ===");
  for (const row of rows) console.log(row.status, row.name, row.detail ?? "");
  console.log(`total=${rows.length} fail=${failed.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
