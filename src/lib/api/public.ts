import { apiGet, apiPost, type RequestOptions } from "@/lib/api/client";
import type { SiteConfigDto } from "@/types/dto/config";
import type { SessionsResponseDto } from "@/types/dto/session";
import type { ReservationDto } from "@/types/dto/reservation";
import type { OrderDto } from "@/types/dto/order";

/**
 * Single typed client for `/api/public/*`. Components must go through
 * these functions instead of calling `fetch()` directly, and must consume
 * only the DTO types below — never a Prisma model.
 */

export function getPublicConfig(options?: RequestOptions): Promise<SiteConfigDto> {
  return apiGet<SiteConfigDto>("/api/public/config", options);
}

export interface GetPublicSessionsParams {
  locationSlug?: string;
  date?: string;
}

export function getPublicSessions(
  params: GetPublicSessionsParams = {},
  options?: RequestOptions,
): Promise<SessionsResponseDto> {
  const search = new URLSearchParams();
  if (params.locationSlug) search.set("locationSlug", params.locationSlug);
  if (params.date) search.set("date", params.date);
  const query = search.toString();
  return apiGet<SessionsResponseDto>(
    `/api/public/sessions${query ? `?${query}` : ""}`,
    options,
  );
}

export interface CreateReservationItemPayload {
  ticketTypeCode: string;
  quantity: number;
}

export interface CreateReservationPayload {
  sessionId: string;
  items: CreateReservationItemPayload[];
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  idempotencyKey?: string;
}

export function createReservation(
  payload: CreateReservationPayload,
  options?: RequestOptions,
): Promise<ReservationDto> {
  return apiPost<ReservationDto>("/api/public/reservations", payload, options);
}

export function getReservation(id: string, options?: RequestOptions): Promise<ReservationDto> {
  return apiGet<ReservationDto>(`/api/public/reservations/${encodeURIComponent(id)}`, options);
}

export interface CreateOrderPayload {
  reservationId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  idempotencyKey?: string;
}

export function createOrder(
  payload: CreateOrderPayload,
  options?: RequestOptions,
): Promise<OrderDto> {
  return apiPost<OrderDto>("/api/public/orders", payload, options);
}

export function getOrder(number: string, options?: RequestOptions): Promise<OrderDto> {
  return apiGet<OrderDto>(`/api/public/orders/${encodeURIComponent(number)}`, options);
}
