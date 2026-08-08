import { test, expect } from "@playwright/test";
import { cashierLogin, expectOk } from "./helpers";

test.describe("Cashier profile", () => {
  test("loads own profile stats and password form", async ({ page }) => {
    const request = page.request;
    await cashierLogin(request);

    const api = await request.get("/api/cashier/profile");
    const payload = await expectOk<{
      profile: { email: string; role: string };
      stats: { weekOrders: number };
      sales: unknown[];
    }>(api);
    expect(payload.profile.email).toContain("@");
    expect(Array.isArray(payload.sales)).toBe(true);

    const pageRes = await page.goto("/cashier/profile");
    expect(pageRes?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: "Профиль" })).toBeVisible();
    await expect(page.getByText("Моя статистика")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Безопасность" })).toBeVisible();
    await expect(page.getByLabel("Текущий пароль")).toBeVisible();
  });

  test("wrong current password is rejected", async ({ request }) => {
    await cashierLogin(request);
    const res = await request.post("/api/cashier/password", {
      data: {
        currentPassword: "DefinitelyWrongPassword!!",
        newPassword: "AnotherStrong1!",
        confirmPassword: "AnotherStrong1!",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("profile ignores foreign userId query and stays own", async ({ request }) => {
    await cashierLogin(request);
    const own = await expectOk<{ profile: { id: string; email: string } }>(
      await request.get("/api/cashier/profile"),
    );
    const spoof = await expectOk<{ profile: { id: string } }>(
      await request.get(`/api/cashier/profile?userId=someone-else-${Date.now()}`),
    );
    expect(spoof.profile.id).toBe(own.profile.id);
  });
});
