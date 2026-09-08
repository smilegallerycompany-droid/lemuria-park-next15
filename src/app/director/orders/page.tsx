"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState, ErrorAlert, PageHeader, StatusBadge } from "@/components/internal";
import { directorFetch, downloadCsv, formatDateTime } from "@/lib/director/client";
import { labelSource, labelStatus } from "@/lib/director/labels";
import { useStaffBasePath } from "@/lib/staff-portal";
import { formatMoneyFromKopecks } from "@/lib/utils";

type OrderRow = {
  number: string;
  status: string;
  source: string;
  totalAmount: number;
  customerName: string;
  createdAt: string;
  location: { name: string };
  session: { startsAt: string };
  _count: { tickets: number };
};

type LocationOpt = { id: string; name: string; city: string };

function moscowDay(offset = 0) {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  local.setDate(local.getDate() + offset);
  local.setHours(0, 0, 0, 0);
  const iso = new Date(local.getTime() - local.getTimezoneOffset() * 60_000);
  return iso.toISOString().slice(0, 10);
}

export default function DirectorOrdersPage() {
  const base = useStaffBasePath();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState("");
  const [from, setFrom] = useState(moscowDay(-29));
  const [to, setTo] = useState(moscowDay(1));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (search) params.set("search", search);
      if (locationId) params.set("locationId", locationId);
      if (from) params.set("from", `${from}T00:00:00+03:00`);
      if (to) params.set("to", `${to}T00:00:00+03:00`);
      const data = await directorFetch<{ orders: OrderRow[] }>(`/api/director/orders?${params}`);
      setOrders(data.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    directorFetch<{ locations: LocationOpt[] }>("/api/director/locations")
      .then((data) => setLocations(data.locations))
      .catch(() => undefined);
    void load();
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader
        title="Заказы"
        description="Заказы всех каналов. Суммы хранятся в копейках, в интерфейсе — рубли."
        actions={
          <>
            <label className="director-field" style={{ margin: 0 }}>
              <span className="sr-only">Локация</span>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                aria-label="Локация"
              >
                <option value="">Все локации</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.city} — {loc.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">С</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Период с" />
            </label>
            <label>
              <span className="sr-only">По</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Период по" />
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Номер, имя, телефон"
              aria-label="Поиск заказов"
            />
            <button type="button" className="internal-btn secondary" onClick={() => void load()}>
              Найти
            </button>
            <button
              type="button"
              className="internal-btn secondary"
              onClick={() =>
                downloadCsv(
                  "orders.csv",
                  orders.map((order) => ({
                    number: order.number,
                    status: order.status,
                    source: order.source,
                    location: order.location.name,
                    customer: order.customerName,
                    amountKopecks: order.totalAmount,
                    tickets: order._count.tickets,
                    createdAt: order.createdAt,
                  })),
                )
              }
              disabled={orders.length === 0}
            >
              Выгрузить
            </button>
          </>
        }
      />
      {error ? <ErrorAlert message={error} /> : null}

      <section className="internal-panel" style={{ padding: 0 }}>
        <div className="internal-table-scroll">
          <table className="internal-table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Клиент</th>
                <th>Локация</th>
                <th>Сеанс</th>
                <th className="num">Сумма</th>
                <th>Источник</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.number}>
                  <td>{order.number}</td>
                  <td>{order.customerName}</td>
                  <td>{order.location.name}</td>
                  <td>{formatDateTime(order.session.startsAt)}</td>
                  <td className="num tabular-nums">{formatMoneyFromKopecks(order.totalAmount)}</td>
                  <td>
                    <StatusBadge
                      tone={order.source === "ONLINE" ? "success" : "warning"}
                      label={labelSource(order.source)}
                    />
                  </td>
                  <td>
                    <StatusBadge status={order.status} label={labelStatus(order.status)} />
                  </td>
                  <td>
                    <Link href={`${base}/orders/${order.number}`} className="internal-btn secondary">
                      Детали
                    </Link>
                  </td>
                </tr>
              ))}
              {!loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title="Заказов нет" description="Попробуйте изменить поиск или период." />
                  </td>
                </tr>
              ) : null}
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="internal-empty">
                    Загрузка…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
