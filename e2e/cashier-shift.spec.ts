import { test, expect } from "@playwright/test";
import {
  CASHIER,
  cashierLogin,
  directorLogin,
  expectOk,
  findBookableSession,
} from "./helpers";

test.describe("Cashier shift lifecycle", () => {
  test("open shift → cash sale → close shift", async ({ request }) => {
    await cashierLogin(request);

    const locs = await expectOk<{ locations: Array<{ id: string }> }>(
      await request.get("/api/cashier/locations"),
    );
    const locationId = locs.locations[0]?.id;
    expect(locationId).toBeTruthy();

    // Close any leftover open shift first
    const current = await request.get("/api/cashier/shift");
    const cur = await current.json();
    if (cur?.ok && cur.data?.shift) {
      await request.patch("/api/cashier/shift", {
        data: { closingCashAmount: cur.data.shift.expectedCashAmount ?? 0, notes: "e2e reset" },
      });
    }

    const opened = await request.post("/api/cashier/shift", {
      data: { locationId, openingCashAmount: 100000, notes: "e2e open" },
    });
    const openData = await expectOk<{ shift: { id: string; status: string } }>(opened);
    expect(openData.shift.status).toBe("OPEN");

    // Duplicate open rejected
    const dup = await request.post("/api/cashier/shift", {
      data: { locationId, openingCashAmount: 0 },
    });
    expect([409, 400]).toContain(dup.status());

    const session = await findBookableSession(request, 1);
    const sale = await request.post("/api/cashier/sales", {
      data: {
        sessionPublicId: session.publicId,
        items: [{ ticketTypeCode: "ADULT", quantity: 1 }],
        paymentMethod: "CASH",
        customerName: "Shift E2E",
      },
      headers: { "Idempotency-Key": `e2e-shift-sale-${crypto.randomUUID()}` },
    });
    expect(sale.status()).toBe(201);

    await request.post("/api/cashier/shift/cash", {
      data: { type: "IN", amount: 5000, comment: "e2e cash in" },
    });

    const beforeClose = await expectOk<{
      shift: { expectedCashAmount: number; cashSalesAmount: number };
    }>(await request.get("/api/cashier/shift"));

    const closed = await request.patch("/api/cashier/shift", {
      data: {
        closingCashAmount: beforeClose.shift.expectedCashAmount,
        notes: "e2e close ok",
      },
    });
    const closeData = await expectOk<{
      shift: { status: string; cashDifferenceAmount: number | null };
    }>(closed);
    expect(closeData.shift.status).toBe("CLOSED");
    expect(closeData.shift.cashDifferenceAmount).toBe(0);
  });

  test("sale without open shift is rejected", async ({ request }) => {
    // Fresh cashier session — ensure no open shift
    await request.post("/api/cashier/login", { data: CASHIER });
    const cur = await request.get("/api/cashier/shift");
    const body = await cur.json();
    if (body?.ok && body.data?.shift) {
      await request.patch("/api/cashier/shift", {
        data: { closingCashAmount: body.data.shift.expectedCashAmount ?? 0, notes: "cleanup" },
      });
    }

    const session = await findBookableSession(request, 1);
    const sale = await request.post("/api/cashier/sales", {
      data: {
        sessionPublicId: session.publicId,
        items: [{ ticketTypeCode: "ADULT", quantity: 1 }],
        paymentMethod: "CASH",
      },
      headers: { "Idempotency-Key": `e2e-noshift-${crypto.randomUUID()}` },
    });
    expect([409, 400]).toContain(sale.status());
  });
});

test.describe("Director shifts", () => {
  test("director can list shifts", async ({ request }) => {
    await directorLogin(request);
    const res = await request.get("/api/director/shifts");
    const data = await expectOk<{ shifts: unknown[] }>(res);
    expect(Array.isArray(data.shifts)).toBe(true);
  });
});
