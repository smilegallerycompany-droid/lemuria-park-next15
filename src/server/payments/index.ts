import { env } from "@/lib/config/env";
import { YooKassaPaymentProvider } from "@/server/payments/yookassa";
import type { PaymentProvider } from "@/server/payments/types";

/**
 * Returns the configured payment provider.
 * When credentials are missing, `configured` is false — callers must not fake success.
 */
export function getPaymentProvider(): PaymentProvider {
  return new YooKassaPaymentProvider(env.YUKASSA_SHOP_ID ?? "", env.YUKASSA_SECRET_KEY ?? "");
}

export type { PaymentProvider, CreatePaymentResult } from "@/server/payments/types";
