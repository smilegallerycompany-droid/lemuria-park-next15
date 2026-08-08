import { test, expect } from "@playwright/test";

test.describe("Public location map section", () => {
  test("locations API returns map payload", async ({ request }) => {
    const res = await request.get("/api/public/locations");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.locations)).toBe(true);
    expect(body.data.locations.length).toBeGreaterThan(0);
    const loc = body.data.locations[0];
    expect(loc.address).toBeTruthy();
    expect(loc.slug).toBeTruthy();
  });

  test("home renders location section when data available", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Где мы находимся/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: /Построить маршрут|Открыть расположение/i }).first()).toBeVisible();
  });
});
