import { test, expect } from "@playwright/test";
import { directorLogin, expectOk } from "./helpers";

test.describe("Director shifts monitoring", () => {
  test("shifts API and page load", async ({ page }) => {
    const request = page.request;
    await directorLogin(request);
    const res = await request.get("/api/director/shifts");
    const data = await expectOk<{ shifts: Array<{ id: string }> }>(res);
    expect(Array.isArray(data.shifts)).toBe(true);

    await page.goto("/director/shifts");
    await expect(page.getByRole("heading", { name: "Смены" })).toBeVisible();
  });
});
