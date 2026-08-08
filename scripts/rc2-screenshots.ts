/**
 * RC2 visual QA screenshots (Playwright).
 * Output: docs/qa-screenshots-rc2/ (gitignored — may contain UI PII).
 *
 * Usage (server on :3001):
 *   npx tsx scripts/rc2-screenshots.ts
 */
import { chromium, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  cashierLogin,
  cashierSale,
  directorLogin,
  expectOk,
  findBookableSession,
} from "../e2e/helpers";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3001";
const OUT = path.resolve("docs/qa-screenshots-rc2");

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    fullPage: false,
  });
  console.log("saved", name);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: BASE,
    locale: "ru-RU",
  });
  const page = await context.newPage();
  const request = context.request;

  // —— Director desktop ——
  await page.setViewportSize({ width: 1440, height: 900 });
  await directorLogin(request);
  await page.goto("/director");
  await page.waitForLoadState("networkidle");
  await shot(page, "director-dashboard-desktop");

  await page.goto("/director/analytics?preset=last_30");
  await page.getByRole("heading", { name: "Аналитика" }).waitFor();
  await page.waitForTimeout(1500);
  await shot(page, "director-analytics-desktop");

  const revenueChart = page.locator(".recharts-responsive-container").first();
  if (await revenueChart.count()) {
    await revenueChart.screenshot({ path: path.join(OUT, "revenue-graph.png") });
    console.log("saved revenue-graph");
  }

  const heatmap = page.locator("[data-testid='occupancy-heatmap'], .heatmap, table").last();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await shot(page, "heatmap");

  // tablet analytics
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/director/analytics?preset=last_30");
  await page.getByRole("heading", { name: "Аналитика" }).waitFor();
  await page.waitForTimeout(1200);
  await shot(page, "director-analytics-tablet");

  // mobile analytics
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/director/analytics?preset=last_30");
  await page.getByRole("heading", { name: "Аналитика" }).waitFor();
  await page.waitForTimeout(1200);
  await shot(page, "director-analytics-mobile");

  // —— Cashier ——
  await context.clearCookies();
  await cashierLogin(request);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/cashier");
  await page.waitForLoadState("networkidle");
  await shot(page, "cashier-desktop");

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/cashier");
  await page.waitForLoadState("networkidle");
  await shot(page, "cashier-tablet");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cashier");
  await page.waitForLoadState("networkidle");
  await shot(page, "cashier-mobile");

  await page.goto("/cashier/profile");
  await page.getByRole("heading", { name: "Профиль" }).waitFor();
  await shot(page, "cashier-profile");

  // QR states
  await page.goto("/cashier/scan");
  await page.getByRole("heading", { name: "QR-сканер" }).waitFor();
  await shot(page, "qr-idle");

  // Camera "scanning" UI is device-bound; capture idle+manual open as proxy for scanning chrome
  await page.getByRole("button", { name: "Ввести код вручную" }).click();
  await shot(page, "qr-scanning");

  const session = await findBookableSession(request, 1);
  const { body } = await cashierSale(request, session.publicId, 1);
  if (!body.ok) throw new Error("sale failed for QR screenshots");
  const orderRes = await request.get(
    `/api/cashier/orders/${encodeURIComponent(body.data.number)}`,
  );
  const orderPayload = await expectOk<{
    order: { tickets: Array<{ qrToken: string }> };
  }>(orderRes);
  const qrToken = orderPayload.order.tickets[0]!.qrToken;

  await page.getByPlaceholder("Вставьте или отсканируйте USB-сканером").fill(qrToken);
  await page.getByRole("button", { name: "Проверить" }).click();
  await page.getByRole("heading", { name: "Вход разрешён" }).waitFor();
  await shot(page, "qr-VALID");

  await page.getByRole("button", { name: "Сканировать следующий" }).click();
  await page.getByRole("button", { name: "Ввести код вручную" }).click();
  await page.getByPlaceholder("Вставьте или отсканируйте USB-сканером").fill(qrToken);
  await page.getByRole("button", { name: "Проверить" }).click();
  await page.getByRole("heading", { name: "Билет уже использован" }).waitFor();
  await shot(page, "qr-ALREADY_USED");

  // WRONG_DATE UI via API mock (real calendar mismatch still needs device/fixture day)
  await page.getByRole("button", { name: "Сканировать следующий" }).click();
  await page.route("**/api/cashier/check-in", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          result: "WRONG_DATE",
          message: "Билет на другую дату",
          ticket: {
            publicId: "demo",
            holderName: "Demo Guest",
            ticketTypeName: "Взрослый",
            sessionLabel: "10:00",
            locationName: "Москва ВДНХ",
            localDate: "2099-01-01",
          },
        },
      }),
    });
  });
  await page.getByRole("button", { name: "Ввести код вручную" }).click();
  await page.getByPlaceholder("Вставьте или отсканируйте USB-сканером").fill("mock-wrong-date");
  await page.getByRole("button", { name: "Проверить" }).click();
  await page.getByRole("heading", { name: "Билет на другую дату" }).waitFor();
  await shot(page, "qr-WRONG_DATE");
  await page.unroute("**/api/cashier/check-in");

  fs.writeFileSync(
    path.join(OUT, "README.md"),
    [
      "# RC2 screenshots",
      "",
      "Generated locally for visual QA. **Do not commit** if images contain PII.",
      "",
      "Physical camera frames (iPhone/Android live video) require device testing:",
      "`PHYSICAL_DEVICE_TEST_REQUIRED`.",
      "",
      "`qr-scanning` here is the manual-entry chrome (Playwright has no real rear camera stream).",
      "`qr-WRONG_DATE` uses a mocked check-in response to capture the result chrome.",
      "",
    ].join("\n"),
  );

  await browser.close();
  console.log("done →", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
