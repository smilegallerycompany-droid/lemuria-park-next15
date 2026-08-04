import { test, expect } from "@playwright/test";
import { CASHIER, DISABLED_USER, readJson } from "./helpers";

test.describe("RBAC", () => {
  test("unauthenticated director API returns 401", async ({ request }) => {
    const res = await request.get("/api/director/locations");
    expect([401, 403]).toContain(res.status());
    const body = await readJson<unknown>(res);
    expect(body.ok).toBe(false);
  });

  test("cashier cannot call /api/director/*", async ({ request }) => {
    const login = await request.post("/api/cashier/login", { data: CASHIER });
    expect(login.status()).toBe(200);

    const res = await request.get("/api/director/locations");
    expect([401, 403]).toContain(res.status());
    const body = await readJson<unknown>(res);
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"]).toContain(body.error.code);
    }
  });

  test("disabled user cannot login", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { ...DISABLED_USER, portal: "cashier" },
    });
    expect(res.status()).toBe(401);
    const body = await readJson<unknown>(res);
    expect(body.ok).toBe(false);
  });
});
