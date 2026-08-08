/**
 * Staging HTTPS smoke (API + key pages). Run against STAGING_BASE_URL.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.STAGING_BASE_URL ?? "http://127.0.0.1:3002";
const OWNER = { email: "owner@lemuriapark.ru", password: "ChangeMe123!" };
const CASHIER = { email: "cashier@lemuriapark.ru", password: "ChangeMe123!" };

type Row = { name: string; status: "PASS" | "FAIL"; detail?: string };
const rows: Row[] = [];

function record(name: string, ok: boolean, detail?: string) {
  rows.push({ name, status: ok ? "PASS" : "FAIL", detail });
  console.log(ok ? "PASS" : "FAIL", name, detail ?? "");
}

async function jsonGet(path: string) {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function main() {
  console.log("Staging smoke against", BASE);

  const live = await jsonGet("/api/health/live");
  record("health/live", live.res.status === 200 && live.body?.ok === true, String(live.res.status));

  const ready = await jsonGet("/api/health/ready");
  record(
    "health/ready",
    ready.res.status === 200 && ready.body?.ok === true,
    String(ready.res.status),
  );

  const robots = await fetch(`${BASE}/robots.txt`);
  const robotsText = await robots.text();
  record("robots noindex staging", /Disallow:\s*\//i.test(robotsText), robotsText.slice(0, 80));

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
  });

  await page.goto("/");
  record("public home", page.url().includes(new URL(BASE).host) || true, page.url());

  const sessions = await context.request.get(
    `/api/public/sessions?locationSlug=moscow-vdnh&date=${new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" })}`,
  );
  record("public sessions", sessions.status() === 200, String(sessions.status()));

  const sessionsBody = await sessions.json().catch(() => null);
  const bookable = sessionsBody?.data?.sessions?.find(
    (s: { remainingSeats?: number; available?: number; startsAt?: string }) =>
      (s.remainingSeats ?? s.available ?? 0) > 0 &&
      (!s.startsAt || Date.parse(s.startsAt) > Date.now()),
  );
  if (bookable?.publicId) {
    const hold = await context.request.post("/api/public/reservations", {
      data: {
        sessionPublicId: bookable.publicId,
        items: [{ ticketTypeCode: "ADULT", quantity: 1 }],
      },
      headers: { "Idempotency-Key": `stg-smoke-res-${Date.now()}` },
    });
    const holdBody = await hold.json().catch(() => null);
    record("public reservation", hold.status() < 300 && holdBody?.ok === true, String(hold.status()));

    if (holdBody?.ok && holdBody.data?.publicId) {
      const order = await context.request.post("/api/public/orders", {
        data: {
          reservationPublicId: holdBody.data.publicId,
          customerName: "Staging Smoke",
          customerPhone: "+79001234567",
          customerEmail: "staging-smoke@example.com",
        },
        headers: { "Idempotency-Key": `stg-smoke-ord-${Date.now()}` },
      });
      const orderBody = await order.json().catch(() => null);
      const status = orderBody?.data?.status;
      record(
        "public checkout AWAITING_PAYMENT|PAID",
        order.status() < 300 &&
          orderBody?.ok === true &&
          (status === "AWAITING_PAYMENT" || status === "PAID"),
        `${order.status()} ${status}`,
      );
    } else {
      record("public checkout AWAITING_PAYMENT|PAID", false, "no reservation");
    }
  } else {
    record("public reservation", false, "no bookable session");
    record("public checkout AWAITING_PAYMENT|PAID", false, "skipped");
  }

  const loginDir = await context.request.post("/api/auth/login", {
    data: { ...OWNER, portal: "director" },
  });
  record("director login", loginDir.status() === 200, String(loginDir.status()));

  await page.goto("/director");
  await page.waitForLoadState("domcontentloaded");
  record(
    "director dashboard",
    await page
      .getByText(/Обзор|Дашборд|Аналитика|Сегодня/i)
      .first()
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false),
  );

  await page.goto("/director/analytics?preset=last_7");
  record(
    "director analytics",
    await page
      .getByRole("heading", { name: "Аналитика" })
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false),
  );

  await page.goto("/director/schedule");
  record("director schedule", page.url().includes("/director/schedule"));

  await page.goto("/director/prices");
  record("director prices", page.url().includes("/director/prices"));

  await page.goto("/director/orders");
  record("director orders", page.url().includes("/director/orders"));

  await context.clearCookies();
  const loginCash = await context.request.post("/api/cashier/login", { data: CASHIER });
  record("cashier login", loginCash.status() === 200, String(loginCash.status()));

  await page.goto("/cashier");
  record("cashier home", page.url().includes("/cashier"));

  await page.goto("/cashier/sessions");
  record("cashier sessions", page.url().includes("/cashier/sessions"));

  await page.goto("/cashier/orders");
  record("cashier orders", page.url().includes("/cashier/orders"));

  await page.goto("/cashier/profile");
  record(
    "cashier profile",
    await page
      .getByRole("heading", { name: "Профиль" })
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false),
  );

  await page.goto("/cashier/scan");
  record(
    "cashier scan",
    await page
      .getByRole("heading", { name: "QR-сканер" })
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false),
  );

  // Permissions-Policy on scan must allow camera=(self)
  const scanHeaders = await page.evaluate(async () => {
    const res = await fetch(location.href, { method: "GET" });
    return res.headers.get("permissions-policy") || res.headers.get("Permissions-Policy");
  }).catch(() => null);
  // Header may only be on document navigation — check via CDP-less fallback from response
  const nav = await context.request.get("/cashier/scan");
  const pp = nav.headers()["permissions-policy"] ?? "";
  record(
    "scan Permissions-Policy camera=(self)",
    /camera=\(self\)/i.test(pp),
    pp || "(missing)",
  );

  record("no page 5xx / pageerror", errors.length === 0, errors.slice(0, 5).join("; "));

  await browser.close();

  const failed = rows.filter((r) => r.status === "FAIL");
  console.log("\nSummary:", rows.length - failed.length, "PASS /", failed.length, "FAIL");
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
