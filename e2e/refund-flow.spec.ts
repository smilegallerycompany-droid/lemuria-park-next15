import { test, expect } from "@playwright/test";
import { createOnlineOrder, directorLogin, expectOk, cashierLogin, findBookableSession } from "./helpers";

test.describe("Refund flow", () => {
  test("director full refund on cashier paid order updates status", async ({ request }) => {
    await cashierLogin(request);
    const locs = await expectOk<{ locations: Array<{ id: string }> }>(
      await request.get("/api/cashier/locations"),
    );
    const locationId = locs.locations[0]!.id;
    const cur = await (await request.get("/api/cashier/shift")).json();
    if (!cur?.data?.shift) {
      await expectOk(
        await request.post("/api/cashier/shift", {
          data: { locationId, openingCashAmount: 0, notes: "refund e2e" },
        }),
      );
    }

    const session = await findBookableSession(request, 1);
    const sale = await request.post("/api/cashier/sales", {
      data: {
        sessionPublicId: session.publicId,
        items: [{ ticketTypeCode: "ADULT", quantity: 1 }],
        paymentMethod: "CASH",
        customerName: "Refund E2E",
      },
      headers: { "Idempotency-Key": `e2e-refund-sale-${crypto.randomUUID()}` },
    });
    const order = await expectOk<{ number: string }>(sale);

    await directorLogin(request);
    const refund = await request.post(`/api/director/orders/${order.number}/refund`, {
      data: { confirm: true, reason: "E2E full refund" },
    });
    const body = await expectOk<{ refund: { status: string }; orderStatus: string }>(refund);
    expect(["SUCCEEDED", "COMPLETED"]).toContain(body.refund.status);
    expect(body.orderStatus).toBe("REFUNDED");
  });

  test("online refund without YooKassa stays not configured / fails safely", async ({
    request,
  }) => {
    await directorLogin(request);
    const order = await createOnlineOrder(request);
    if (order.status !== "PAID") {
      // Without YooKassa order is AWAITING_PAYMENT — refund must be rejected
      const res = await request.post(`/api/director/orders/${order.number}/refund`, {
        data: { confirm: true, reason: "should fail" },
      });
      expect([409, 400, 422]).toContain(res.status());
      return;
    }
    // If somehow paid, provider path may be NOT_CONFIGURED
    const res = await request.post(`/api/director/orders/${order.number}/refund`, {
      data: { confirm: true, reason: "online refund attempt" },
    });
    expect([200, 502, 503, 409]).toContain(res.status());
  });
});
