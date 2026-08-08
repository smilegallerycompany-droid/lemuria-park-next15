import { test, expect } from "@playwright/test";

test.describe("Health + scan Permissions-Policy", () => {
  test("live and ready health endpoints", async ({ request }) => {
    const live = await request.get("/api/health/live");
    expect(live.status()).toBe(200);
    const liveBody = await live.json();
    expect(liveBody.ok).toBe(true);

    const ready = await request.get("/api/health/ready");
    expect(ready.status()).toBe(200);
    const readyBody = await ready.json();
    expect(readyBody.ok).toBe(true);
    expect(readyBody.checks.database).toBe("ok");
  });

  test("cashier scan allows camera=(self)", async ({ request }) => {
    const res = await request.get("/cashier/scan");
    expect(res.status()).toBeLessThan(400);
    const policy = res.headers()["permissions-policy"] ?? "";
    expect(policy).toMatch(/camera=\(self\)/i);
  });

  test("public home keeps camera disabled", async ({ request }) => {
    const res = await request.get("/");
    const policy = res.headers()["permissions-policy"] ?? "";
    expect(policy).toMatch(/camera=\(\)/i);
  });
});
