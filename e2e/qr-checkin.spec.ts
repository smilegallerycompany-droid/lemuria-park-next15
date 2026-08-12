import { test, expect } from "@playwright/test";
import { cashierLogin, cashierSale, expectOk, findBookableSession, moscowToday, readJson } from "./helpers";

test.describe("QR check-in", () => {
  test("SUCCESS then ALREADY_USED for the same ticket", async ({ request }) => {
    await cashierLogin(request);
    const session = await findBookableSession(request, 1);
    test.skip(session.localDate !== moscowToday(), "no remaining bookable session today for check-in date");
    const { res, body } = await cashierSale(request, session.publicId, 1);
    expect(res.status()).toBe(201);
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("sale failed");

    const orderRes = await request.get(
      `/api/cashier/orders/${encodeURIComponent(body.data.number)}`,
    );
    const orderPayload = await expectOk<{
      order: { tickets: Array<{ qrToken: string; status: string }> };
    }>(orderRes);

    const tickets = orderPayload.order.tickets;
    expect(tickets.length).toBeGreaterThan(0);
    const qrToken = tickets[0].qrToken;
    expect(qrToken.length).toBeGreaterThan(8);

    const first = await request.post("/api/cashier/check-in", {
      data: { qrToken },
    });
    const firstBody = await readJson<{ result: string }>(first);
    expect(firstBody.ok).toBe(true);
    if (!firstBody.ok) throw new Error("check-in failed");
    expect(firstBody.data.result).toBe("SUCCESS");

    const second = await request.post("/api/cashier/check-in", {
      data: { qrToken },
    });
    const secondBody = await readJson<{ result: string }>(second);
    expect(secondBody.ok).toBe(true);
    if (!secondBody.ok) throw new Error("second check-in failed");
    expect(secondBody.data.result).toBe("ALREADY_USED");
  });
});
