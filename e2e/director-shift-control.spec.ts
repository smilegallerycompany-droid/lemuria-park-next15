import { test, expect } from "@playwright/test";
import { cashierLogin, directorLogin, expectOk } from "./helpers";

test.describe("Director shift control", () => {
  test("list filters and force-close OPEN shift", async ({ page }) => {
    await cashierLogin(page.request);
    const cur = await (await page.request.get("/api/cashier/shift")).json();
    if (cur?.ok && cur.data?.shift) {
      await page.request.patch("/api/cashier/shift", {
        data: { closingCashAmount: cur.data.shift.expectedCashAmount ?? 0, notes: "reset" },
      });
    }
    const locs = await expectOk<{ locations: Array<{ id: string }> }>(
      await page.request.get("/api/cashier/locations"),
    );
    const opened = await expectOk<{ shift: { id: string } }>(
      await page.request.post("/api/cashier/shift", {
        data: { locationId: locs.locations[0]!.id, openingCashAmount: 3000, notes: "force target" },
      }),
    );

    await directorLogin(page.request);
    await page.goto("/director/shifts");
    await expect(page.getByRole("heading", { name: "Смены" })).toBeVisible();
    await expect(page.getByText("Открытые сейчас")).toBeVisible();
    await expect(page.getByRole("button", { name: "Сегодня" })).toBeVisible();

    const forced = await page.request.post("/api/director/shifts", {
      data: {
        shiftId: opened.shift.id,
        closingCashAmount: 3000,
        reason: "e2e force close reason",
      },
    });
    const data = await expectOk<{ shift: { status: string } }>(forced);
    expect(data.shift.status).toBe("FORCE_CLOSED");

    await page.goto(`/director/shifts/${opened.shift.id}`);
    await expect(page.getByText("FORCE_CLOSED")).toBeVisible();
  });
});
