"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiClientError, apiGet, apiPost } from "@/lib/api/client";
import { getCashierOrders, type CashierOrderRow } from "@/lib/api/cashier";
import { formatMoneyFromKopecks } from "@/lib/utils";

type Filter = "today" | "all" | "paid" | "cancelled";

type OrderDetail = {
  number: string;
  status: string;
  source: string;
  totalAmount: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  createdAt: string;
  cashierName: string | null;
  locationName: string;
  sessionDate: string;
  sessionTime: string;
  items: Array<{
    ticketTypeName: string;
    quantity: number;
    unitPriceAmount: number;
    subtotalAmount: number;
  }>;
  tickets: Array<{
    publicId: string;
    qrToken: string;
    status: string;
    ticketTypeName: string;
  }>;
  emailDelivery: {
    status: string;
    toAddress: string;
    errorMessage: string | null;
    createdAt: string;
  } | null;
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "today", label: "Сегодня" },
  { id: "all", label: "Все" },
  { id: "paid", label: "Оплачен" },
  { id: "cancelled", label: "Отменён" },
];

function emailStatusLabel(status: string | undefined) {
  switch (status) {
    case "SENT":
      return "Email отправлен";
    case "FAILED":
      return "Email ошибка";
    case "NOT_CONFIGURED":
      return "Email не настроен";
    default:
      return "Email: нет записи";
  }
}

export default function CashierOrdersPage() {
  const [filter, setFilter] = useState<Filter>("today");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<CashierOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getCashierOrders({ filter, search: search || undefined });
      setOrders(response.orders);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Не удалось загрузить заказы");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(number: string) {
    setDetailError(null);
    try {
      const data = await apiGet<{ order: OrderDetail }>(`/api/cashier/orders/${number}`);
      setDetail(data.order);
    } catch (err) {
      setDetailError(err instanceof ApiClientError ? err.message : "Не удалось открыть заказ");
    }
  }

  async function printOrder() {
    if (!detail) return;
    try {
      await apiPost(`/api/cashier/orders/${detail.number}/print`, { note: "browser-print" });
    } catch {
      /* still allow browser print */
    }
    window.print();
  }

  function onSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  return (
    <>
      <h1 className="cashier-page-title">Заказы</h1>
      <p className="cashier-page-sub">Список из `/api/cashier/orders` · печать в браузере</p>

      <div className="cashier-filters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`cashier-filter-btn ${filter === item.id ? "active" : ""}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSearchSubmit} className="cashier-panel" style={{ marginBottom: "1rem" }}>
        <div className="cashier-field" style={{ marginBottom: 0 }}>
          <label htmlFor="order-search">Поиск по номеру заказа</label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              id="order-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Например, LP-…"
              style={{ flex: "1 1 200px" }}
            />
            <button type="submit" className="cashier-btn cashier-btn-primary">
              Найти
            </button>
          </div>
        </div>
      </form>

      {error ? <p className="cashier-error">{error}</p> : null}
      {loading ? (
        <div className="cashier-loading">Загрузка…</div>
      ) : orders.length === 0 ? (
        <div className="cashier-empty">Заказы не найдены</div>
      ) : (
        <div className="cashier-orders-list">
          {orders.map((order) => (
            <button
              key={order.number}
              type="button"
              className="cashier-order-row"
              style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
              onClick={() => void openDetail(order.number)}
            >
              <div className="cashier-order-head">
                <span>{order.number}</span>
                <span>{formatMoneyFromKopecks(order.totalAmount)}</span>
              </div>
              <div style={{ color: "rgba(32,53,16,0.65)", fontSize: "0.9rem" }}>
                {order.status} · {order.source} · {order.sessionTime} · {order.customerName}
              </div>
            </button>
          ))}
        </div>
      )}

      {detailError ? <p className="cashier-error">{detailError}</p> : null}

      {detail ? (
        <div className="cashier-panel" style={{ marginTop: "1.25rem" }} id="cashier-order-print">
          <div className="cashier-order-head">
            <strong>{detail.number}</strong>
            <button type="button" className="cashier-btn cashier-btn-ghost" onClick={() => setDetail(null)}>
              Закрыть
            </button>
          </div>
          <p style={{ margin: "0.5rem 0" }}>
            {detail.locationName} · {detail.sessionDate} {detail.sessionTime}
          </p>
          <p style={{ margin: "0.25rem 0" }}>
            {detail.customerName} · {detail.customerPhone} · {detail.customerEmail}
          </p>
          <p style={{ margin: "0.25rem 0", fontWeight: 700 }}>
            {formatMoneyFromKopecks(detail.totalAmount)} · {detail.status}
          </p>
          <p style={{ margin: "0.5rem 0", color: "rgba(32,53,16,0.7)" }}>
            {emailStatusLabel(detail.emailDelivery?.status)}
            {detail.emailDelivery?.errorMessage
              ? ` · ${detail.emailDelivery.errorMessage}`
              : ""}
            {!detail.emailDelivery ? " (честный статус: запись TicketDelivery отсутствует)" : ""}
          </p>
          <ul style={{ margin: "0.75rem 0", paddingLeft: "1.1rem" }}>
            {detail.items.map((item) => (
              <li key={`${item.ticketTypeName}-${item.quantity}`}>
                {item.ticketTypeName} × {item.quantity} —{" "}
                {formatMoneyFromKopecks(item.subtotalAmount)}
              </li>
            ))}
          </ul>
          <ul style={{ margin: "0.75rem 0", paddingLeft: "1.1rem", fontSize: "0.9rem" }}>
            {detail.tickets.map((ticket) => (
              <li key={ticket.publicId}>
                {ticket.ticketTypeName}: {ticket.qrToken} ({ticket.status})
              </li>
            ))}
          </ul>
          <button type="button" className="cashier-btn cashier-btn-primary" onClick={() => void printOrder()}>
            Печать
          </button>
        </div>
      ) : null}
    </>
  );
}
