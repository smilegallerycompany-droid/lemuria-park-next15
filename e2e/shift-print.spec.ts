import { test, expect } from "@playwright/test";
import { cashierLogin, directorLogin, expectOk } from "./helpers";

test.describe("Shift report print", () => {
  test("cashier report page and director print control exist", async ({ page }) => {
    await cashierLogin(page.request);
    const cur = await (await page.request.get("/api/cashier/shift")).json();
    if (cur?.ok && cur.data?.shift) {
      await page.request.patch("/api/cashier/shift", {
        data: { closingCashAmount: cur.data.shift.expectedCashAmount ?? 0, notes: "print close" },
      });
    }
    const locs = await expectOk<{ locations: Array<{ id: string }> }>(
      await page.request.get("/api/cashier/locations"),
    );
    await expectOk(
      await page.request.post("/api/cashier/shift", {
        data: { locationId: locs.locations[0]!.id, openingCashAmount: 1000, notes: "print" },
      }),
    );
    const closed = await expectOk<{ shift: { id: string } }>(
      await page.request.patch("/api/cashier/shift", {
        data: { closingCashAmount: 1000, notes: "print ok" },
      }),
    );

    await page.goto("/cashier/shift/report");
    await expect(page.getByTestId("shift-report")).toBeVisible();
    await expect(page.getByRole("button", { name: "Распечатать отчёт" })).toBeVisible();

    await directorLogin(page.request);
    await page.goto(`/director/shifts/${closed.shift.id}`);
    await expect(page.getByRole("button", { name: "Печать отчёта" })).toBeVisible();
  });
});
