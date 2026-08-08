import { test, expect } from "@playwright/test";
import { directorLogin, expectOk } from "./helpers";

test.describe("Director analytics", () => {
  test("filters, KPI payload and empty-safe charts load", async ({ page }) => {
    const request = page.request;
    await directorLogin(request);

    const api = await request.get("/api/director/analytics?preset=today");
    const payload = await expectOk<{
      kpis: { netRevenueKopecks: number; paidOrders: number };
      revenueSeries: unknown[];
      filters: { preset: string; timezone: string };
    }>(api);

    expect(payload.filters.preset).toBe("today");
    expect(payload.filters.timezone).toBeTruthy();
    expect(typeof payload.kpis.netRevenueKopecks).toBe("number");
    expect(Array.isArray(payload.revenueSeries)).toBe(true);

    const pageRes = await page.goto("/director/analytics?preset=last_7");
    expect(pageRes?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: "Аналитика" })).toBeVisible();
    await expect(page.getByRole("button", { name: "7 дней" })).toBeVisible();
    await expect(page.getByText("Чистая выручка")).toBeVisible();
    await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
  });
});
