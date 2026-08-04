/**
 * Business-rule error codes raised by the domain layer and returned
 * verbatim (with a mapped HTTP status — see src/lib/api/response.ts) to API
 * clients. Keeping this as a union instead of free-form strings keeps
 * client-side error handling exhaustive and typo-proof.
 */
export type DomainErrorCode =
  | "CONFIG_NOT_FOUND"
  | "LOCATION_NOT_FOUND"
  | "SESSION_NOT_FOUND"
  | "SESSION_NOT_AVAILABLE"
  | "SESSION_SOLD_OUT"
  | "INSUFFICIENT_CAPACITY"
  | "INVALID_TICKET_TYPE"
  | "TICKET_TYPE_NOT_FOUND"
  | "PRICE_NOT_CONFIGURED"
  | "RESERVATION_NOT_FOUND"
  | "RESERVATION_EXPIRED"
  | "RESERVATION_ALREADY_CONVERTED"
  | "IDEMPOTENCY_CONFLICT"
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_PAID"
  | "PAYMENT_NOT_CONFIGURED"
  | "PAYMENT_PROVIDER_ERROR"
  | "PAYMENT_WEBHOOK_INVALID";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: unknown;

  constructor(code: DomainErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}
