import { env } from "@/lib/config/env";
import { DomainError } from "@/server/domain/errors";

const YOOKASSA_API = "https://api.yookassa.ru/v3";

export type YooRefundResult = {
  providerRefundId: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
};

/**
 * YooKassa refund API — never invents success without provider response.
 */
export async function createYooKassaRefund(params: {
  providerPaymentId: string;
  amountKopecks: number;
  idempotencyKey: string;
  reason?: string;
}): Promise<YooRefundResult> {
  const shopId = env.YUKASSA_SHOP_ID;
  const secret = env.YUKASSA_SECRET_KEY;
  if (!shopId || !secret) {
    throw new DomainError(
      "PAYMENT_NOT_CONFIGURED",
      "ЮKassa не настроена — online refund недоступен",
    );
  }

  const auth = `Basic ${Buffer.from(`${shopId}:${secret}`).toString("base64")}`;
  const res = await fetch(`${YOOKASSA_API}/refunds`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      "Idempotence-Key": params.idempotencyKey,
    },
    body: JSON.stringify({
      payment_id: params.providerPaymentId,
      amount: {
        value: (params.amountKopecks / 100).toFixed(2),
        currency: "RUB",
      },
      description: params.reason?.slice(0, 250),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DomainError(
      "PAYMENT_PROVIDER_ERROR",
      `ЮKassa отклонила возврат (${res.status})`,
      { body: body.slice(0, 500) },
    );
  }

  const data = (await res.json()) as { id: string; status: string };
  return {
    providerRefundId: data.id,
    status: mapRefundStatus(data.status),
  };
}

function mapRefundStatus(status: string): YooRefundResult["status"] {
  switch (status) {
    case "succeeded":
      return "SUCCEEDED";
    case "canceled":
    case "cancelled":
      return "CANCELLED";
    case "pending":
      return "PENDING";
    default:
      return "FAILED";
  }
}
