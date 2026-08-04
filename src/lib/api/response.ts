import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import type { ApiErrorBody, ApiSuccessBody } from "@/types/api";
import { DomainError, type DomainErrorCode } from "@/server/domain/errors";

/**
 * Well-known, stable error codes used across the public API. Domain errors
 * are passed through verbatim (e.g. `INSUFFICIENT_CAPACITY`,
 * `SESSION_SOLD_OUT`) so clients can branch on the precise business reason
 * instead of a generic bucket. A small set of generic codes covers
 * request-validation and low-level persistence failures.
 */
export type ApiErrorCode =
  | DomainErrorCode
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_REFERENCE"
  | "DATABASE_ERROR"
  | "INTERNAL_ERROR";

/** Maps each domain-layer error code to its public HTTP status. */
const DOMAIN_ERROR_STATUS: Record<DomainErrorCode, number> = {
  CONFIG_NOT_FOUND: 404,
  LOCATION_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  SESSION_NOT_AVAILABLE: 409,
  SESSION_SOLD_OUT: 409,
  INSUFFICIENT_CAPACITY: 409,
  INVALID_TICKET_TYPE: 422,
  TICKET_TYPE_NOT_FOUND: 400,
  PRICE_NOT_CONFIGURED: 409,
  RESERVATION_NOT_FOUND: 404,
  RESERVATION_EXPIRED: 410,
  RESERVATION_ALREADY_CONVERTED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  ORDER_NOT_FOUND: 404,
  ORDER_NOT_PAID: 409,
  PAYMENT_NOT_CONFIGURED: 503,
  PAYMENT_PROVIDER_ERROR: 502,
  PAYMENT_WEBHOOK_INVALID: 400,
};

/** Throw this from services/route handlers to produce a well-formed API error response. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiSuccessBody<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

/**
 * Central error handler for API route handlers. Pass any caught error and
 * get back a well-formed, safe NextResponse — never leaks stack traces or
 * raw Prisma internals to the client.
 */
export function handleApiError(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    return apiError(error.code, error.message, error.status, error.details);
  }

  if (error instanceof DomainError) {
    return apiError(error.code, error.message, DOMAIN_ERROR_STATUS[error.code], error.details);
  }

  if (error instanceof ZodError) {
    return apiError("VALIDATION_ERROR", "Некорректные данные запроса", 400, error.flatten());
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return apiError("CONFLICT", "Запись с такими данными уже существует", 409, {
          target: error.meta?.target,
        });
      case "P2025":
        return apiError("NOT_FOUND", "Запись не найдена", 404);
      case "P2003":
        return apiError("INVALID_REFERENCE", "Некорректная ссылка на связанную запись", 400);
      default:
        return apiError("DATABASE_ERROR", "Ошибка базы данных", 500, { prismaCode: error.code });
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return apiError("VALIDATION_ERROR", "Некорректный запрос к базе данных", 400);
  }

  // Unexpected error — log server-side for diagnostics, but never leak details to the client.
  console.error("Unhandled API error:", error);
  return apiError("INTERNAL_ERROR", "Внутренняя ошибка сервера", 500);
}
