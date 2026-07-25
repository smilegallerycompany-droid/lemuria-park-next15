/**
 * Unified API response envelope shared by every route under /api/public/*.
 *
 * Success:  { ok: true,  data: T }
 * Failure:  { ok: false, error: { code, message, details? } }
 */
export interface ApiSuccessBody<T> {
  ok: true;
  data: T;
}

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorBody {
  ok: false;
  error: ApiErrorShape;
}

export type ApiResponseBody<T> = ApiSuccessBody<T> | ApiErrorBody;
