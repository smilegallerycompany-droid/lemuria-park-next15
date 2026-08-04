import assert from "node:assert/strict";
import test from "node:test";
import { YooKassaPaymentProvider } from "@/server/payments/yookassa";
import { DomainError } from "@/server/domain/errors";

test("YooKassa provider is not configured without credentials", () => {
  const provider = new YooKassaPaymentProvider("", "");
  assert.equal(provider.configured, false);
});

test("parseWebhook maps succeeded payment", () => {
  const provider = new YooKassaPaymentProvider("shop", "secret");
  const update = provider.parseWebhook({
    event: "payment.succeeded",
    object: { id: "pay-1", status: "succeeded" },
  });
  assert.equal(update.providerPaymentId, "pay-1");
  assert.equal(update.status, "SUCCEEDED");
});

test("parseWebhook rejects payload without payment id", () => {
  const provider = new YooKassaPaymentProvider("shop", "secret");
  assert.throws(
    () => provider.parseWebhook({ event: "payment.succeeded", object: {} }),
    (error: unknown) => error instanceof DomainError && error.code === "PAYMENT_WEBHOOK_INVALID",
  );
});

test("createPayment refuses when not configured (no fake success)", async () => {
  const provider = new YooKassaPaymentProvider("", "");
  await assert.rejects(
    () =>
      provider.createPayment({
        orderId: "o1",
        orderNumber: "LP-1",
        amountKopecks: 90000,
        description: "test",
        returnUrl: "https://example.com/return",
        idempotencyKey: "k1",
      }),
    (error: unknown) => error instanceof DomainError && error.code === "PAYMENT_NOT_CONFIGURED",
  );
});
