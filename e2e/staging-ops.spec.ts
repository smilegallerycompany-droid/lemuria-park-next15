import { expect, test } from "@playwright/test";

/**
 * Operational endpoints required before staging acceptance.
 * Does not require YooKassa credentials.
 */
test.describe("Staging operational checks", () => {
  test("GET /api/health/live is ok", async ({ request }) => {
    const response = await request.get("/api/health/live");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("live");
    expect(JSON.stringify(body)).not.toMatch(/password|secret|postgres:\/\//i);
  });

  test("GET /api/health/ready reports database without leaking secrets", async ({ request }) => {
    const response = await request.get("/api/health/ready");
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body.checks).toBeTruthy();
    expect(body.checks.database).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/password|AUTH_SECRET|QR_SIGNING|postgres:\/\//i);
  });

  test("POST /api/cron/cleanup without secret is 401", async ({ request }) => {
    const response = await request.post("/api/cron/cleanup");
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("UNAUTHORIZED");
  });
});
