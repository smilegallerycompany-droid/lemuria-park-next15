import { test, expect } from "@playwright/test";
import { DISABLED_USER, cashierLogin, directorLogin } from "./helpers";

test.describe("Cashier login shell", () => {
  test("anonymous /cashier redirects to a clean login", async ({ page }) => {
    await page.goto("/cashier");
    await expect(page).toHaveURL(/\/cashier\/login/);
    await expect(page.getByRole("heading", { name: "Вход кассира" })).toBeVisible();
    await expect(page.getByText("Смена не открыта")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Касса" })).toHaveCount(0);
    await expect(page.locator("#cashier-email")).toHaveValue("");
    await expect(page.locator("#cashier-password")).toHaveValue("");
  });

  test("anonymous /cashier/login stays on login with empty fields", async ({ page }) => {
    await page.goto("/cashier/login");
    await expect(page).toHaveURL(/\/cashier\/login/);
    await expect(page.getByRole("heading", { name: "Вход кассира" })).toBeVisible();
    await expect(page.locator("#cashier-email")).toHaveValue("");
    await expect(page.locator("#cashier-password")).toHaveValue("");
  });

  test("authenticated cashier reaches the app, not login", async ({ page }) => {
    await cashierLogin(page.request);
    await page.goto("/cashier");
    await expect(page).not.toHaveURL(/\/cashier\/login/);
    await expect(page.getByText("Касса · Лемурия")).toBeVisible();
  });

  test("authenticated owner can open cashier app", async ({ page }) => {
    await directorLogin(page.request);
    await page.goto("/cashier");
    await expect(page).not.toHaveURL(/\/cashier\/login/);
    await expect(page.getByText("Касса · Лемурия")).toBeVisible();
  });

  test("disabled user cannot obtain a cashier session", async ({ request }) => {
    const res = await request.post("/api/cashier/login", { data: DISABLED_USER });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(String(body.error?.message ?? "")).toMatch(/неверный email или пароль/i);
  });

  test("unknown email uses the same generic error", async ({ request }) => {
    const res = await request.post("/api/cashier/login", {
      data: { email: "nobody@lemuria.test", password: "not-a-real-password-123" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(String(body.error?.message ?? "")).toMatch(/неверный email или пароль/i);
  });

  test("expired session cookie is sent back to login", async ({ page, context }) => {
    await context.addCookies([
      {
        name: "lemuria_staff_session",
        value: "expired-or-forged-token",
        url: "http://127.0.0.1:3001",
      },
    ]);
    await page.goto("/cashier");
    await expect(page).toHaveURL(/\/cashier\/login/);
  });

  test("logout returns to login and clears the app shell", async ({ page }) => {
    await cashierLogin(page.request);
    await page.goto("/cashier/profile");
    await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
    await expect(page).toHaveURL(/\/cashier\/login/);
    await expect(page.getByRole("heading", { name: "Вход кассира" })).toBeVisible();
    await expect(page.getByText("Касса · Лемурия")).toHaveCount(0);
  });
});
