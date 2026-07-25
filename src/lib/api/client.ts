import type { ApiResponseBody } from "@/types/api";

/**
 * Thrown whenever `/api/public/*` responds with `{ ok: false, ... }` or the
 * request itself fails. Carries the same stable `code` the server used, so
 * UI code can branch on it (e.g. `INSUFFICIENT_CAPACITY`, `RESERVATION_EXPIRED`).
 */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
}

async function request<T>(path: string, init: RequestInit, options?: RequestOptions): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      signal: options?.signal,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiClientError("NETWORK_ERROR", "Не удалось связаться с сервером", 0);
  }

  let body: ApiResponseBody<T>;
  try {
    body = (await res.json()) as ApiResponseBody<T>;
  } catch {
    throw new ApiClientError("INVALID_RESPONSE", "Сервер вернул некорректный ответ", res.status);
  }

  if (!body.ok) {
    throw new ApiClientError(body.error.code, body.error.message, res.status, body.error.details);
  }

  return body.data;
}

/** Typed GET against the public API. */
export function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>(path, { method: "GET" }, options);
}

/** Typed POST against the public API. */
export function apiPost<T>(path: string, payload: unknown, options?: RequestOptions): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(payload) }, options);
}
