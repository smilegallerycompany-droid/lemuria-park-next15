import { test, expect } from "@playwright/test";
import { createOnlineOrder, findBookableSession, moscowToday } from "./helpers";

test.describe("Public booking", () => {
  test("tickets page loads", async ({ page }) => {
    const res = await page.goto("/tickets");
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();
  });

  test("reservation + order stays AWAITING_PAYMENT when YooKassa unset", async ({ request }) => {
    const session = await findBookableSession(request, 1);
    expect(session.localDate).toBe(moscowToday());

    const order = await createOnlineOrder(request, {
      quantity: 1,
      sessionPublicId: session.publicId,
    });

    expect(order.status).toBe("AWAITING_PAYMENT");
    expect(order.paymentConfigured).toBe(false);
    expect(order.paymentStatus).not.toBe("SUCCEEDED");
    expect(order.tickets).toHaveLength(0);

    const getRes = await request.get(`/api/public/orders/${encodeURIComponent(order.number)}`);
    expect(getRes.status()).toBe(200);
    const again = await getRes.json();
    expect(again.ok).toBe(true);
    expect(again.data.status).toBe("AWAITING_PAYMENT");
    expect(again.data.paymentConfigured).toBe(false);
  });
});
