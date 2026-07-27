import { apiGet, apiPost, type RequestOptions } from "@/lib/api/client";

export interface CashierUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface CashierSessionCard {
  publicId: string;
  localTime: string;
  startsAt: string;
  capacity: number;
  sold: number;
  remaining: number;
  soldOut: boolean;
}

export interface CashierSessionsResponse {
  location: { city: string; venue: string; timezone: string };
  date: string;
  ticketTypes: Array<{ code: string; name: string; unitPrice: number | null }>;
  sessions: CashierSessionCard[];
}

export interface CashierOrderRow {
  number: string;
  status: string;
  source: string;
  totalAmount: number;
  createdAt: string;
  customerName: string;
  cashierName: string | null;
  sessionTime: string;
  items: Array<{ ticketTypeName: string; quantity: number; subtotal: number }>;
}

export function cashierLogin(email: string, password: string) {
  return apiPost<CashierUser>("/api/cashier/login", { email, password });
}

export function cashierLogout() {
  return apiPost<{ ok: boolean }>("/api/cashier/logout", {});
}

export function getCashierMe(options?: RequestOptions) {
  return apiGet<CashierUser>("/api/cashier/me", options);
}

export function getCashierSessions(options?: RequestOptions) {
  return apiGet<CashierSessionsResponse>("/api/cashier/sessions", options);
}

export function getCashierOrders(
  params: { filter?: string; search?: string } = {},
  options?: RequestOptions,
) {
  const search = new URLSearchParams();
  if (params.filter) search.set("filter", params.filter);
  if (params.search) search.set("search", params.search);
  const query = search.toString();
  return apiGet<{ orders: CashierOrderRow[] }>(
    `/api/cashier/orders${query ? `?${query}` : ""}`,
    options,
  );
}

export function createCashierSale(
  input: {
    sessionPublicId: string;
    items: Array<{ ticketTypeCode: string; quantity: number }>;
    paymentMethod: "CASH" | "CARD_TERMINAL";
    customerName?: string;
  },
  idempotencyKey: string,
) {
  return apiPost<{
    number: string;
    status: string;
    source: string;
    totalAmount: number;
    items: Array<{ ticketTypeName: string; quantity: number; subtotal: number }>;
  }>("/api/cashier/sales", input, { idempotencyKey });
}
