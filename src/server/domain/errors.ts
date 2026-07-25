/**
 * Business-rule error codes raised by the domain layer. The domain layer
 * never knows about HTTP — the service/API layer maps these to the public
 * `ApiErrorCode` + HTTP status (see src/lib/api/response.ts).
 */
export type DomainErrorCode =
  | "LOCATION_NOT_FOUND"
  | "SESSION_NOT_FOUND"
  | "SESSION_UNAVAILABLE"
  | "INSUFFICIENT_CAPACITY"
  | "TICKET_TYPE_NOT_FOUND"
  | "PRICE_NOT_FOUND"
  | "RESERVATION_NOT_FOUND"
  | "RESERVATION_EXPIRED"
  | "RESERVATION_ALREADY_CONVERTED"
  | "ORDER_NOT_FOUND";

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
