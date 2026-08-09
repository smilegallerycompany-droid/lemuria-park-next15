import { test, expect } from "@playwright/test";
import { directorLogin, expectOk } from "./helpers";

test.describe("Director today dashboard", () => {
  test("overview API returns real KPIs, sessions, alerts array", async ({ page }) => {
    const request = page.request;
    await directorLogin(request);
    const res = await request.get("/api/director/overview");
    const data = await expectOk<{
      kpis: { netRevenueKopecks: number; paidOrders: number };
      sessions: unknown[];
      alerts: Array<{ title: string; href: string }>;
      charts: { revenueByHour: unknown[] };
    }>(res);

    expect(typeof data.kpis.netRevenueKopecks).toBe("number");
    expect(Array.isArray(data.sessions)).toBe(true);
    expect(Array.isArray(data.alerts)).toBe(true);
    expect(Array.isArray(data.charts.revenueByHour)).toBe(true);

    await page.goto("/director");
    await expect(page.getByRole("heading", { name: "Сегодня" })).toBeVisible();
    await expect(page.getByText("Выручка сегодня")).toBeVisible({ timeout: 30_000 });
  });
});
