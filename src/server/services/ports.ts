export interface PaymentGateway {
  createPayment(input: {
    orderId: string;
    amount: number;
    returnUrl: string;
  }): Promise<{ id: string; confirmationUrl: string }>;
  getPayment(id: string): Promise<{ status: "pending" | "succeeded" | "cancelled" }>;
}
export interface EmailGateway {
  sendTicket(input: { to: string; orderNumber: string; ticketUrl: string }): Promise<void>;
}
export interface QrGateway {
  createSignedCode(input: { ticketId: string; orderNumber: string }): Promise<string>;
}
