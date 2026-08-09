import { test, expect } from "@playwright/test";
import { cashierLogin, expectOk, findBookableSession } from "./helpers";

test.describe("Ticket print", () => {
  test("print endpoint creates PrintLog", async ({ request }) => {
    await cashierLogin(request);
    const locs = await expectOk<{ locations: Array<{ id: string }> }>(
      await request.get("/api/cashier/locations"),
    );
    const cur = await (await request.get("/api/cashier/shift")).json();
    if (!cur?.data?.shift) {
      await expectOk(
        await request.post("/api/cashier/shift", {
          data: {
            locationId: locs.locations[0]!.id,
            openingCashAmount: 0,
            notes: "print e2e",
          },
        }),
      );
    }

    const session = await findBookableSession(request, 1);
    const sale = await request.post("/api/cashier/sales", {
      data: {
        sessionPublicId: session.publicId,
        items: [{ ticketTypeCode: "ADULT", quantity: 1 }],
        paymentMethod: "CARD_TERMINAL",
        customerName: "Print E2E",
      },
      headers: { "Idempotency-Key": `e2e-print-${crypto.randomUUID()}` },
    });
    const order = await expectOk<{ number: string }>(sale);

    const print = await request.post(`/api/cashier/orders/${order.number}/print`, {
      data: { note: "e2e-print" },
    });
    const data = await expectOk<{ printLog: { id: string; source: string } }>(print);
    expect(data.printLog.id).toBeTruthy();
    expect(data.printLog.source).toBe("cashier");
  });
});
