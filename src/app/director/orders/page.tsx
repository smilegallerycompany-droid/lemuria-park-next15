"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState, ErrorAlert, PageHeader, StatusBadge } from "@/components/internal";
import { directorFetch, formatDateTime } from "@/lib/director/client";
import { labelSource, labelStatus } from "@/lib/director/labels";
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

export default function DirectorOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(query = "") {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (query) params.set("search", query);
      const data = await directorFetch<{ orders: OrderRow[] }>(`/api/director/orders?${params}`);
      setOrders(data.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <PageHeader
        title="Заказы"
        description="Заказы всех каналов. Суммы хранятся в копейках, в интерфейсе — рубли."
        actions={
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Номер, имя, телефон"
              aria-label="Поиск заказов"
            />
            <button type="button" className="internal-btn secondary" onClick={() => void load(search)}>
              Найти
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
                    <Link href={`/director/orders/${order.number}`} className="internal-btn secondary">
                      Детали
                    </Link>
                  </td>
                </tr>
              ))}
              {!loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title="Заказов нет" description="Попробуйте изменить поиск." />
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
