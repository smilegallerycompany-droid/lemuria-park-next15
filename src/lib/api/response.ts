import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import type { ApiErrorBody, ApiSuccessBody } from "@/types/api";

/**
 * Well-known, stable error codes used across the public API. Keeping this as
 * a union (instead of free-form strings) keeps client-side error handling
 * exhaustive and typo-proof.
 */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SESSION_FULL"
  | "SESSION_UNAVAILABLE"
  | "INVALID_REFERENCE"
  | "DATABASE_ERROR"
  | "INTERNAL_ERROR";

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
