import { test, expect } from "@playwright/test";
import {
  createOnlineOrder,
  directorLogin,
  expectOk,
  findBookableSession,
} from "./helpers";

test.describe("Director pricing", () => {
  test("future validFrom price change does not alter existing order unitPrice", async ({
    request,
  }) => {
    await directorLogin(request);

    const session = await findBookableSession(request, 1);
    const order = await createOnlineOrder(request, {
      quantity: 1,
      sessionPublicId: session.publicId,
    });
    expect(order.status).toBe("AWAITING_PAYMENT");
    const originalUnit = order.items[0]?.unitPrice;
    expect(typeof originalUnit).toBe("number");

    const locations = await expectOk<{ locations: Array<{ id: string }> }>(
      await request.get("/api/director/locations"),
    );
    const ticketTypes = await expectOk<{
      ticketTypes: Array<{ id: string; code: string }>;
    }>(await request.get("/api/director/ticket-types"));
    const adult = ticketTypes.ticketTypes.find((t) => t.code === "ADULT");
    expect(adult).toBeTruthy();

    const futureFrom = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const createPrice = await request.post("/api/director/prices", {
      data: {
        locationId: locations.locations[0].id,
        ticketTypeId: adult!.id,
        dayType: "WEEKDAY",
        priceAmount: originalUnit! + 50_000,
        validFrom: futureFrom,
        isActive: true,
      },
    });
    expect(createPrice.status()).toBe(201);

    const again = await expectOk<{
      items: Array<{ unitPrice: number }>;
      status: string;
    }>(await request.get(`/api/public/orders/${encodeURIComponent(order.number)}`));

    expect(again.items[0].unitPrice).toBe(originalUnit);
    expect(again.status).toBe("AWAITING_PAYMENT");
  });
});
