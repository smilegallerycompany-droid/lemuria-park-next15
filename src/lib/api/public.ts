import {
  apiGet,
  apiGetWithMeta,
  apiPost,
  type RequestOptions,
  type ResponseMeta,
} from "@/lib/api/client";
import type { PublicConfigDto } from "@/types/dto/config";
import type { PublicSessionsResponseDto } from "@/types/dto/session";
import type { PublicReservationDto } from "@/types/dto/reservation";
import type { PublicOrderDto } from "@/types/dto/order";

/**
 * Single typed client for `/api/public/*`. Components must go through
 * these functions instead of calling `fetch()` directly, and must consume
 * only the DTO types below — never a Prisma model.
 */

export function getPublicConfig(
  options?: RequestOptions & { locationSlug?: string },
): Promise<PublicConfigDto> {
  const slug = options?.locationSlug;
  const search = slug ? `?locationSlug=${encodeURIComponent(slug)}` : "";
  return apiGet<PublicConfigDto>(`/api/public/config${search}`, options);
}

export interface GetPublicSessionsParams {
  locationSlug?: string;
  /** `YYYY-MM-DD`, interpreted in the active location's own timezone. */
  date?: string;
}

export function getPublicSessions(
  params: GetPublicSessionsParams = {},
  options?: RequestOptions,
): Promise<PublicSessionsResponseDto> {
  const search = new URLSearchParams();
  if (params.locationSlug) search.set("locationSlug", params.locationSlug);
  if (params.date) search.set("date", params.date);
  const query = search.toString();
  return apiGet<PublicSessionsResponseDto>(
    `/api/public/sessions${query ? `?${query}` : ""}`,
    options,
  );
}

export interface CreatePublicReservationItemInput {
  ticketTypeCode: string;
  quantity: number;
}

export interface CreatePublicReservationInput {
  sessionPublicId: string;
  items: CreatePublicReservationItemInput[];
}

/** Pass `idempotencyKey` so a retried submit never creates a second reservation. */
export function createPublicReservation(
  input: CreatePublicReservationInput,
  idempotencyKey: string,
  options?: Omit<RequestOptions, "idempotencyKey">,
): Promise<PublicReservationDto> {
  return apiPost<PublicReservationDto>("/api/public/reservations", input, {
    ...options,
    idempotencyKey,
  });
}

export function getPublicReservation(
  publicId: string,
  options?: RequestOptions,
): Promise<PublicReservationDto> {
  return apiGet<PublicReservationDto>(
    `/api/public/reservations/${encodeURIComponent(publicId)}`,
    options,
  );
}

/**
 * Same as `getPublicReservation`, but also returns the server's own clock
 * (from the response `Date` header) — used to correct the checkout
 * countdown timer for drift between the client's and server's clocks.
 */
export function getPublicReservationWithMeta(
  publicId: string,
  options?: RequestOptions,
): Promise<{ data: PublicReservationDto; meta: ResponseMeta }> {
  return apiGetWithMeta<PublicReservationDto>(
    `/api/public/reservations/${encodeURIComponent(publicId)}`,
    options,
  );
}

export interface CreatePublicOrderInput {
  reservationPublicId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

/** Pass `idempotencyKey` so a retried submit never creates a second order. */
export function createPublicOrder(
  input: CreatePublicOrderInput,
  idempotencyKey: string,
  options?: Omit<RequestOptions, "idempotencyKey">,
): Promise<PublicOrderDto> {
  return apiPost<PublicOrderDto>("/api/public/orders", input, { ...options, idempotencyKey });
}

export function getPublicOrder(number: string, options?: RequestOptions): Promise<PublicOrderDto> {
  return apiGet<PublicOrderDto>(`/api/public/orders/${encodeURIComponent(number)}`, options);
}
