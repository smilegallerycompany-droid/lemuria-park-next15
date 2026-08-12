import { test, expect } from "@playwright/test";
import {
  cashierLogin,
  cashierSale,
  expectOk,
  findBookableSession,
} from "./helpers";

test.describe("Cashier sale", () => {
  test("login cookie + cash sale marks PAID and decreases seats", async ({ page }) => {
    // page.request shares the cookie jar with page navigations.
    const request = page.request;
    await cashierLogin(request);

    const session = await findBookableSession(request, 1);
    const beforeRes = await request.get("/api/cashier/sessions");
    const before = await expectOk<{
      sessions: Array<{ publicId: string; remaining: number }>;
    }>(beforeRes);
    const beforeRow = before.sessions.find((s) => s.publicId === session.publicId);
    const availableBefore = beforeRow?.remaining ?? session.available;

    const { res, body } = await cashierSale(request, session.publicId, 1);
    expect(res.status()).toBe(201);
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("sale failed");
    expect(body.data.status).toBe("PAID");

    const afterRes = await request.get("/api/cashier/sessions");
    const after = await expectOk<{
      sessions: Array<{ publicId: string; remaining: number }>;
    }>(afterRes);
    const afterRow = after.sessions.find((s) => s.publicId === session.publicId);
    if (afterRow) {
      expect(afterRow.remaining).toBe(availableBefore - 1);
    }

    const pageRes = await page.goto("/cashier");
    expect(pageRes?.ok()).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();
  });
});
