import { test, expect } from "@playwright/test";
import {
  cashierLogin,
  cashierSale,
  expectOk,
  findBookableSession,
  moscowToday,
  readJson,
} from "./helpers";

test.describe("Mobile QR scanner UI", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    // Mock camera permission — Playwright does not exercise a real device camera.
    permissions: ["camera"],
  });

  test("idle screen + manual VALID / ALREADY_USED via mocked recognition path", async ({
    page,
  }) => {
    const request = page.request;
    await cashierLogin(request);

    const session = await findBookableSession(request, 1);
    test.skip(session.localDate !== moscowToday(), "no remaining bookable session today for check-in date");
    const { body } = await cashierSale(request, session.publicId, 1);
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("sale failed");

    const orderRes = await request.get(
      `/api/cashier/orders/${encodeURIComponent(body.data.number)}`,
    );
    const orderPayload = await expectOk<{
      order: { tickets: Array<{ qrToken: string }> };
    }>(orderRes);
    const qrToken = orderPayload.order.tickets[0]!.qrToken;

    await page.goto("/cashier/scan");
    await expect(page.getByRole("heading", { name: "QR-сканер" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Включить камеру" })).toBeVisible();
    await page.getByRole("button", { name: "Ввести код вручную" }).click();
    await page.getByPlaceholder("Вставьте или отсканируйте USB-сканером").fill(qrToken);
    await page.getByRole("button", { name: "Проверить" }).click();
    await expect(page.getByRole("heading", { name: "Вход разрешён" })).toBeVisible();

    await page.getByRole("button", { name: "Сканировать следующий" }).click();
    await page.getByRole("button", { name: "Ввести код вручную" }).click();
    await page.getByPlaceholder("Вставьте или отсканируйте USB-сканером").fill(qrToken);
    await page.getByRole("button", { name: "Проверить" }).click();
    await expect(page.getByRole("heading", { name: "Билет уже использован" })).toBeVisible();

    // API-level double check still returns ALREADY_USED
    const second = await request.post("/api/cashier/check-in", { data: { qrToken } });
    const secondBody = await readJson<{ result: string }>(second);
    expect(secondBody.ok).toBe(true);
    if (!secondBody.ok) throw new Error("expected ALREADY_USED");
    expect(secondBody.data.result).toBe("ALREADY_USED");
  });
});
