import { test, expect } from "@playwright/test";
import { cashierLogin, expectOk } from "./helpers";

async function resetShift(request: import("@playwright/test").APIRequestContext) {
  const cur = await (await request.get("/api/cashier/shift")).json();
  if (cur?.ok && cur.data?.shift) {
    await request.patch("/api/cashier/shift", {
      data: { closingCashAmount: cur.data.shift.expectedCashAmount ?? 0, notes: "e2e reset" },
    });
  }
}

test.describe("Cashier cash operations", () => {
  test("IN updates balance; OUT above balance is rejected", async ({ request }) => {
    await cashierLogin(request);
    await resetShift(request);
    const locs = await expectOk<{ locations: Array<{ id: string }> }>(
      await request.get("/api/cashier/locations"),
    );
    await expectOk(
      await request.post("/api/cashier/shift", {
        data: { locationId: locs.locations[0]!.id, openingCashAmount: 10000, notes: "ops" },
      }),
    );

    const inn = await request.post("/api/cashier/shift/cash", {
      data: { type: "IN", amount: 5000, comment: "Размен" },
    });
    const innData = await expectOk<{ currentCashBalance: number }>(inn);
    expect(innData.currentCashBalance).toBe(15000);

    const tooMuch = await request.post("/api/cashier/shift/cash", {
      data: { type: "OUT", amount: 999999, comment: "too much" },
    });
    expect(tooMuch.status()).toBe(409);
    const body = await tooMuch.json();
    expect(body.error?.code).toBe("INSUFFICIENT_CASH_BALANCE");

    const out = await request.post("/api/cashier/shift/cash", {
      data: { type: "OUT", amount: 2000, comment: "Инкассация" },
    });
    const outData = await expectOk<{ currentCashBalance: number }>(out);
    expect(outData.currentCashBalance).toBe(13000);

    const after = await expectOk<{
      shift: { currentCashBalance: number; operations: unknown[] };
    }>(await request.get("/api/cashier/shift"));
    expect(after.shift.currentCashBalance).toBe(13000);
    expect(after.shift.operations.length).toBeGreaterThan(0);
  });
});
