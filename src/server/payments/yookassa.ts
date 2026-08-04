import { DomainError } from "@/server/domain/errors";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  WebhookPaymentUpdate,
} from "@/server/payments/types";

const YOOKASSA_API = "https://api.yookassa.ru/v3";

type YooKassaPaymentResponse = {
  id: string;
  status: string;
  confirmation?: { type: string; confirmation_url?: string };
};

/**
 * Real YooKassa adapter — talks only to api.yookassa.ru (accessible in RU without VPN).
 * Never invents a successful payment locally.
 */
export class YooKassaPaymentProvider implements PaymentProvider {
  readonly name = "yookassa" as const;
  readonly configured: boolean;

  constructor(
    private readonly shopId: string,
    private readonly secretKey: string,
  ) {
    this.configured = Boolean(shopId && secretKey);
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.shopId}:${this.secretKey}`).toString("base64")}`;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!this.configured) {
      throw new DomainError(
        "PAYMENT_NOT_CONFIGURED",
        "ЮKassa не настроена: задайте YUKASSA_SHOP_ID и YUKASSA_SECRET_KEY",
      );
    }

    const res = await fetch(`${YOOKASSA_API}/payments`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
        "Idempotence-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        amount: {
          value: (input.amountKopecks / 100).toFixed(2),
          currency: "RUB",
        },
        capture: true,
        confirmation: {
          type: "redirect",
          return_url: input.returnUrl,
        },
        description: input.description,
        metadata: {
          orderId: input.orderId,
          orderNumber: input.orderNumber,
        },
        receipt: input.customerEmail
          ? {
              customer: { email: input.customerEmail },
              items: [
                {
                  description: input.description.slice(0, 128),
                  quantity: "1.00",
                  amount: {
                    value: (input.amountKopecks / 100).toFixed(2),
                    currency: "RUB",
                  },
                  vat_code: 1,
                  payment_subject: "service",
                  payment_mode: "full_payment",
                },
              ],
            }
          : undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new DomainError(
        "PAYMENT_PROVIDER_ERROR",
        `ЮKassa отклонила создание платежа (${res.status})`,
        { body: body.slice(0, 500) },
      );
    }

    const data = (await res.json()) as YooKassaPaymentResponse;
    const confirmationUrl = data.confirmation?.confirmation_url;
    if (!confirmationUrl) {
      throw new DomainError(
        "PAYMENT_PROVIDER_ERROR",
        "ЮKassa не вернула ссылку на оплату",
        data,
      );
    }

    const status = mapYooStatus(data.status);
    return {
      provider: "yookassa",
      providerPaymentId: data.id,
      confirmationUrl,
      status: status === "FAILED" ? "PENDING" : status,
    };
  }

  parseWebhook(payload: unknown): WebhookPaymentUpdate {
    const body = payload as {
      event?: string;
      object?: { id?: string; status?: string };
    };
    const providerPaymentId = body.object?.id;
    if (!providerPaymentId) {
      throw new DomainError("PAYMENT_WEBHOOK_INVALID", "Webhook ЮKassa без object.id");
    }
    return {
      providerPaymentId,
      status: mapYooStatus(body.object?.status ?? "pending"),
      raw: payload,
    };
  }
}

function mapYooStatus(status: string): CreatePaymentResult["status"] | "FAILED" {
  switch (status) {
    case "succeeded":
      return "SUCCEEDED";
    case "canceled":
    case "cancelled":
      return "CANCELLED";
    case "pending":
    case "waiting_for_capture":
      return "PENDING";
    default:
      return "FAILED";
  }
}
