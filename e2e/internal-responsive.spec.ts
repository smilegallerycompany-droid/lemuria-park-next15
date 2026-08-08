import { test, expect } from "@playwright/test";
import { cashierLogin, directorLogin } from "./helpers";

test.describe("Internal responsive shells", () => {
  test("director analytics at tablet width", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await directorLogin(page.request);
    await page.goto("/director/analytics?preset=today");
    await expect(page.getByRole("heading", { name: "Аналитика" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Меню" })).toBeVisible();
  });

  test("cashier bottom nav on phone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await cashierLogin(page.request);
    await page.goto("/cashier");
    await expect(page.locator(".cashier-bottom-nav")).toBeVisible();
    await expect(page.locator(".cashier-bottom-nav a.scan-link")).toBeVisible();
    await page.goto("/cashier/profile");
    await expect(page.getByRole("heading", { name: "Профиль" })).toBeVisible();
  });
});
