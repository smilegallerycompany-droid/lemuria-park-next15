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
  /** Sent as the `Idempotency-Key` header — makes a mutating request safe to retry. */
  idempotencyKey?: string;
}

export interface ResponseMeta {
  /** The server's own clock at response time (parsed from the `Date` header), if present. */
  serverDate: Date | null;
}

async function requestWithMeta<T>(
  path: string,
  init: RequestInit,
  options?: RequestOptions,
): Promise<{ data: T; meta: ResponseMeta }> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      signal: options?.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiClientError("NETWORK_ERROR", "Не удалось связаться с сервером", 0);
  }

  const rawDate = res.headers.get("date");
  const serverDate = rawDate && !Number.isNaN(Date.parse(rawDate)) ? new Date(rawDate) : null;

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiClientError("INVALID_RESPONSE", "Сервер вернул некорректный ответ", res.status);
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

  return { data: body.data, meta: { serverDate } };
}

/** Typed GET against the public API. */
export async function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  const { data } = await requestWithMeta<T>(path, { method: "GET" }, options);
  return data;
}

/**
 * Same as `apiGet`, but also returns response metadata (e.g. the server's
 * clock) — used where the client needs to correct for clock drift, such as
 * a countdown timer anchored to a server-issued `expiresAt`.
 */
export function apiGetWithMeta<T>(
  path: string,
  options?: RequestOptions,
): Promise<{ data: T; meta: ResponseMeta }> {
  return requestWithMeta<T>(path, { method: "GET" }, options);
}

/** Typed POST against the public API. Pass `options.idempotencyKey` for safe retries. */
export async function apiPost<T>(
  path: string,
  payload: unknown,
  options?: RequestOptions,
): Promise<T> {
  const { data } = await requestWithMeta<T>(
    path,
    { method: "POST", body: JSON.stringify(payload) },
    options,
  );
  return data;
}

export async function apiPatch<T>(
  path: string,
  payload: unknown,
  options?: RequestOptions,
): Promise<T> {
  const { data } = await requestWithMeta<T>(
    path,
    { method: "PATCH", body: JSON.stringify(payload) },
    options,
  );
  return data;
}
