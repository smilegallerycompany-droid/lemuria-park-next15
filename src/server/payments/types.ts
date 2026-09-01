export type CreatePaymentInput = {
  orderId: string;
  orderNumber: string;
  amountKopecks: number;
  description: string;
  returnUrl: string;
  idempotencyKey: string;
  customerEmail?: string;
};

export type CreatePaymentResult = {
  provider: "yookassa";
  providerPaymentId: string;
  confirmationUrl: string;
  status: "PENDING" | "SUCCEEDED" | "CANCELLED";
};

export type WebhookPaymentUpdate = {
  providerPaymentId: string;
  status: "PENDING" | "SUCCEEDED" | "CANCELLED" | "FAILED";
  raw: unknown;
};

export interface PaymentProvider {
  readonly name: "yookassa";
  readonly configured: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  parseWebhook(payload: unknown): WebhookPaymentUpdate;
  /** Confirm webhook claims against the provider. Optional on stubs. */
  fetchPayment?(providerPaymentId: string): Promise<{ status: WebhookPaymentUpdate["status"] }>;
}
