import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Result } from "axe-core";

async function expectNoSeriousAxe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (item: Result) => item.impact === "critical" || item.impact === "serious",
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test.describe("Accessibility", () => {
  test("cashier login has no critical/serious axe issues", async ({ page }) => {
    await page.goto("/cashier/login");
    await expect(page.getByRole("heading", { name: "Вход кассира" })).toBeVisible();
    await expectNoSeriousAxe(page);
  });

  test("director login has no critical/serious axe issues", async ({ page }) => {
    await page.goto("/director/login");
    await expect(page.getByRole("heading", { name: "Director" })).toBeVisible();
    await expectNoSeriousAxe(page);
  });

  test("admin login has no critical/serious axe issues", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    await expectNoSeriousAxe(page);
  });

  test("public home has no critical/serious axe issues", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    await expectNoSeriousAxe(page);
  });
});
