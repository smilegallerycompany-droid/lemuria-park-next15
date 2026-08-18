/**
 * RC3 visual QA screenshots (Playwright).
 * Output: docs/qa-screenshots-rc3/ (gitignored).
 *
 * Usage (server on :3001 with latest build):
 *   npx tsx scripts/rc3-screenshots.ts
 */
import { chromium, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { cashierLogin, directorLogin, expectOk } from "../e2e/helpers";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3001";
const OUT = path.resolve("docs/qa-screenshots-rc3");

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  console.log("saved", name);
}

async function ensureOpenShift(request: Parameters<typeof cashierLogin>[0]) {
  const cur = await (await request.get("/api/cashier/shift")).json();
  if (cur?.ok && cur.data?.shift) return;
  const locs = await expectOk<{ locations: Array<{ id: string }> }>(
    await request.get("/api/cashier/locations"),
  );
  await expectOk(
    await request.post("/api/cashier/shift", {
      data: { locationId: locs.locations[0]!.id, openingCashAmount: 2550000, notes: "qa open" },
    }),
  );
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE, locale: "ru-RU" });
  const page = await context.newPage();
  const request = context.request;

  await cashierLogin(request);
  await ensureOpenShift(request);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/cashier");
  await page.waitForLoadState("networkidle");
  await shot(page, "cashier-desktop");

  await page.goto("/cashier/shift");
  await page.waitForLoadState("networkidle");
  await shot(page, "cashier-shift-open");

  await page.getByRole("button", { name: "Внести наличные" }).click();
  await page.locator(".cashier-sheet").waitFor();
  await shot(page, "cashier-cash-in");
  await page.locator(".cashier-sheet").getByRole("button", { name: "Отмена" }).click();

  await page.getByRole("button", { name: "Изъять наличные" }).click();
  await page.locator(".cashier-sheet").waitFor();
  await page.locator(".cashier-sheet input").first().fill("10000");
  await shot(page, "cashier-cash-out");
  await page.locator(".cashier-sheet").getByRole("button", { name: "Отмена" }).click();

  await page.goto("/cashier/shift/close");
  await page.getByRole("heading", { name: "Закрытие смены" }).waitFor();
  await shot(page, "cashier-close-shift");
  await page.locator(".cashier-shift-close input").first().fill("100");
  await page.waitForTimeout(300);
  await shot(page, "cashier-close-shortage");

  const cur = await (await request.get("/api/cashier/shift")).json();
  if (cur?.ok && cur.data?.shift) {
    await request.patch("/api/cashier/shift", {
      data: {
        closingCashAmount: Math.max(0, (cur.data.shift.expectedCashAmount ?? 0) - 120000),
        notes: "QA недостача для отчёта",
      },
    });
  }
  await page.goto("/cashier/shift/report");
  await page.waitForLoadState("networkidle");
  await shot(page, "cashier-shift-report");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cashier");
  await page.waitForLoadState("networkidle");
  await shot(page, "cashier-mobile");

  await page.goto("/cashier/scan");
  await page.waitForLoadState("networkidle");
  await shot(page, "qr-mobile");

  await page.setViewportSize({ width: 1440, height: 900 });
  await directorLogin(request);
  await page.goto("/director/shifts");
  await page.waitForLoadState("networkidle");
  await shot(page, "director-shifts");

  await page.goto("/director");
  await page.waitForLoadState("networkidle");
  await shot(page, "director-difference-alert");

  fs.writeFileSync(
    path.join(OUT, "README.md"),
    [
      "# RC3 screenshots",
      "",
      "Generated locally for visual QA. Do not commit images with PII.",
      "Physical iPhone/Android QR camera: PHYSICAL_DEVICE_TEST_REQUIRED.",
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
