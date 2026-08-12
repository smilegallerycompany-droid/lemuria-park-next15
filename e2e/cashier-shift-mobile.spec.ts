import { test, expect } from "@playwright/test";
import { cashierLogin, expectOk } from "./helpers";

test.describe("Cashier shift mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("bottom nav and compact shift bar", async ({ page }) => {
    await cashierLogin(page.request);
    const cur = await (await page.request.get("/api/cashier/shift")).json();
    if (!cur?.ok || !cur.data?.shift) {
      const locs = await expectOk<{ locations: Array<{ id: string }> }>(
        await page.request.get("/api/cashier/locations"),
      );
      await page.request.post("/api/cashier/shift", {
        data: { locationId: locs.locations[0]!.id, openingCashAmount: 0, notes: "mobile" },
      });
    }

    await page.goto("/cashier");
    await expect(page.getByRole("navigation", { name: "Мобильная навигация кассы" })).toBeVisible();
    await expect(page.getByRole("link", { name: "QR" })).toBeVisible();
    await expect(page.getByTestId("cashier-shift-bar")).toBeVisible();
    await expect(page.getByTestId("cashier-shift-bar").getByRole("link", { name: "Смена" })).toBeVisible();

    await page.goto("/cashier/shift");
    await expect(page.getByRole("button", { name: "Внести наличные" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Изъять наличные" })).toBeVisible();
  });

  test("open-shift form when no shift", async ({ page }) => {
    await cashierLogin(page.request);
    const cur = await (await page.request.get("/api/cashier/shift")).json();
    if (cur?.ok && cur.data?.shift) {
      await page.request.patch("/api/cashier/shift", {
        data: { closingCashAmount: cur.data.shift.expectedCashAmount ?? 0, notes: "mobile close" },
      });
    }
    await page.goto("/cashier");
    await expect(page.getByTestId("open-shift-form")).toBeVisible();
    await expect(page.getByRole("button", { name: "Открыть смену" })).toBeVisible();
  });
});
