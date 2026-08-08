import { test, expect } from "@playwright/test";
import { OWNER, CASHIER, directorLogin, cashierLogin } from "./helpers";

test.describe("Admin auth RBAC", () => {
  test("cashier cannot open admin dashboard API", async ({ request }) => {
    await cashierLogin(request);
    const res = await request.get("/api/admin/dashboard");
    expect([401, 403]).toContain(res.status());
  });

  test("owner can open admin dashboard", async ({ request }) => {
    await directorLogin(request);
    const res = await request.get("/api/admin/dashboard");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.system.database).toBeTruthy();
  });

  test("admin login portal rejects cashier", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { ...CASHIER, portal: "admin" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("owner admin login works", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { ...OWNER, portal: "admin" },
    });
    expect(res.status()).toBe(200);
  });
});
