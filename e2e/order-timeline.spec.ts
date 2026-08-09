import { test, expect } from "@playwright/test";
import { createOnlineOrder, directorLogin, expectOk } from "./helpers";

test.describe("Order timeline", () => {
  test("timeline includes ORDER_CREATED and payment/tickets when paid", async ({ request }) => {
    await directorLogin(request);
    const order = await createOnlineOrder(request);

    const res = await request.get(`/api/director/orders/${order.number}`);
    const data = await expectOk<{
      order: { number: string; status: string };
      timeline: Array<{ type: string }>;
    }>(res);

    expect(data.order.number).toBe(order.number);
    const types = data.timeline.map((t) => t.type);
    expect(types).toContain("ORDER_CREATED");

    if (order.status === "PAID" || data.order.status === "PAID") {
      expect(types.some((t) => t === "PAYMENT_SUCCEEDED" || t === "PAYMENT_CREATED")).toBe(true);
      expect(types).toContain("TICKETS_ISSUED");
    }
  });
});
