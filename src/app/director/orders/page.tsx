"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
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

  async function load(query = "") {
    const params = new URLSearchParams({ limit: "100" });
    if (query) params.set("search", query);
    const data = await directorFetch<{ orders: OrderRow[] }>(`/api/director/orders?${params}`);
    setOrders(data.orders);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, []);

  return (
    <>
      <PageHeader
        title="Заказы"
        description="Заказы всех каналов. Суммы хранятся в копейках."
        actions={
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по номеру, имени, телефону"
            />
            <button type="button" className="director-btn secondary" onClick={() => load(search)}>
              Найти
            </button>
          </>
        }
      />
      {error ? <div className="director-alert error">{error}</div> : null}

      <section className="director-panel">
        <div className="director-table-wrap">
          <table className="director-table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Клиент</th>
                <th>Локация</th>
                <th>Сеанс</th>
                <th>Сумма</th>
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
                  <td>{formatMoneyFromKopecks(order.totalAmount)}</td>
                  <td>
                    <span className={`director-badge ${order.source === "ONLINE" ? "green" : "orange"}`}>
                      {labelSource(order.source)}
                    </span>
                  </td>
                  <td>{labelStatus(order.status)}</td>
                  <td>
                    <Link href={`/director/orders/${order.number}`} className="director-link">
                      Детали ({order._count.tickets})
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
