import { test, expect } from "@playwright/test";
import { directorLogin, expectOk } from "./helpers";

test.describe("Director analytics", () => {
  test("filters, KPI payload and empty-safe charts load", async ({ page }) => {
    const request = page.request;
    await directorLogin(request);

    const api = await request.get("/api/director/analytics?preset=today");
    const payload = await expectOk<{
      kpis: {
        netRevenueKopecks: number;
        paidOrders: number;
        reservationConversionRate: number;
      };
      revenueSeries: unknown[];
      locations: unknown[];
      filters: { preset: string; timezone: string };
    }>(api);

    expect(payload.filters.preset).toBe("today");
    expect(payload.filters.timezone).toBeTruthy();
    expect(typeof payload.kpis.netRevenueKopecks).toBe("number");
    expect(typeof payload.kpis.reservationConversionRate).toBe("number");
    expect(Array.isArray(payload.revenueSeries)).toBe(true);
    expect(Array.isArray(payload.locations)).toBe(true);

    const pageRes = await page.goto("/director/analytics?preset=last_7");
    expect(pageRes?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: "Аналитика" })).toBeVisible();
    await expect(page.getByRole("button", { name: "7 дней" })).toBeVisible();
    await expect(page.getByText("Чистая выручка")).toBeVisible();
    await expect(page.getByText("Конверсия reservation")).toBeVisible();
    await expect(page.getByRole("button", { name: "CSV" }).first()).toBeVisible();
  });

  test("rejects inverted custom period", async ({ request }) => {
    await directorLogin(request);
    const bad = await request.get(
      "/api/director/analytics?preset=custom&from=2030-01-10T00:00:00.000Z&to=2030-01-01T00:00:00.000Z",
    );
    expect(bad.status()).toBe(400);
  });
});
