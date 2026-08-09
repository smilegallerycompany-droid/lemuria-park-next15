import { test, expect } from "@playwright/test";
import { cashierLogin, expectOk } from "./helpers";

test.describe("Cashier close shift", () => {
  test("close computes difference when actual differs", async ({ request }) => {
    await cashierLogin(request);
    const locs = await expectOk<{ locations: Array<{ id: string }> }>(
      await request.get("/api/cashier/locations"),
    );
    const locationId = locs.locations[0]!.id;

    const cur = await (await request.get("/api/cashier/shift")).json();
    if (cur?.ok && cur.data?.shift) {
      await request.patch("/api/cashier/shift", {
        data: { closingCashAmount: cur.data.shift.expectedCashAmount ?? 0, notes: "reset" },
      });
    }

    await expectOk(
      await request.post("/api/cashier/shift", {
        data: { locationId, openingCashAmount: 10000, notes: "diff test" },
      }),
    );

    const before = await expectOk<{ shift: { expectedCashAmount: number } }>(
      await request.get("/api/cashier/shift"),
    );

    const closed = await request.patch("/api/cashier/shift", {
      data: {
        closingCashAmount: before.shift.expectedCashAmount - 100,
        notes: "недостача e2e",
      },
    });
    const data = await expectOk<{
      shift: { cashDifferenceAmount: number | null; status: string };
    }>(closed);
    expect(data.shift.status).toBe("CLOSED");
    expect(data.shift.cashDifferenceAmount).toBe(-100);
  });
});
