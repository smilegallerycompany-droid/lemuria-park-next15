"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { directorFetch, formatPercent } from "@/lib/director/client";
import { formatMoneyFromKopecks } from "@/lib/utils";
import type { DirectorAnalytics } from "@/server/services/analytics";

export default function DirectorAnalyticsPage() {
  const [data, setData] = useState<DirectorAnalytics | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load(override?: { from?: string; to?: string; locationId?: string }) {
    const params = new URLSearchParams();
    if (override?.from || from) params.set("from", override?.from ?? from);
    if (override?.to || to) params.set("to", override?.to ?? to);
    const loc = override?.locationId ?? locationId;
    if (loc) params.set("locationId", loc);
    const analytics = await directorFetch<DirectorAnalytics>(`/api/director/analytics?${params}`);
    setData(analytics);
  }

  useEffect(() => {
    Promise.all([
      directorFetch<{ locations: Array<{ id: string; name: string }> }>("/api/director/locations"),
      directorFetch<DirectorAnalytics>("/api/director/analytics"),
    ])
      .then(([locationsData, analytics]) => {
        setLocations(locationsData.locations);
        setData(analytics);
        setFrom(analytics.from);
        setTo(analytics.to);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, []);

  return (
    <>
      <PageHeader
        title="Аналитика"
        description="Выручка только по оплаченным заказам, возвраты, каналы продаж и заполненность."
        actions={
          <>
            <input type="datetime-local" value={from.slice(0, 16)} onChange={(e) => setFrom(new Date(e.target.value).toISOString())} />
            <input type="datetime-local" value={to.slice(0, 16)} onChange={(e) => setTo(new Date(e.target.value).toISOString())} />
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Все локации</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
            <button type="button" className="director-btn primary" onClick={() => load()}>
              Применить
            </button>
          </>
        }
      />
      {error ? <div className="director-alert error">{error}</div> : null}
      {!data ? <div className="director-empty">Загрузка…</div> : null}
      {data ? (
        <div className="director-card-grid">
          <div className="director-kpi">
            <div className="director-kpi-label">Валовая выручка</div>
            <div className="director-kpi-value accent-green">{formatMoneyFromKopecks(data.revenueKopecks)}</div>
          </div>
          <div className="director-kpi">
            <div className="director-kpi-label">Возвраты</div>
            <div className="director-kpi-value accent-orange">{formatMoneyFromKopecks(data.refundsKopecks)}</div>
          </div>
          <div className="director-kpi">
            <div className="director-kpi-label">Чистая выручка</div>
            <div className="director-kpi-value">{formatMoneyFromKopecks(data.netRevenueKopecks)}</div>
          </div>
          <div className="director-kpi">
            <div className="director-kpi-label">Онлайн</div>
            <div className="director-kpi-value">{formatMoneyFromKopecks(data.revenueBySource.ONLINE)}</div>
          </div>
          <div className="director-kpi">
            <div className="director-kpi-label">Касса</div>
            <div className="director-kpi-value">{formatMoneyFromKopecks(data.revenueBySource.CASHIER)}</div>
          </div>
          <div className="director-kpi">
            <div className="director-kpi-label">Заказы / билеты</div>
            <div className="director-kpi-value">
              {data.orderCount} / {data.ticketCount}
            </div>
          </div>
          <div className="director-kpi">
            <div className="director-kpi-label">Средний чек</div>
            <div className="director-kpi-value">{formatMoneyFromKopecks(data.averageOrderValueKopecks)}</div>
          </div>
          <div className="director-kpi">
            <div className="director-kpi-label">Заполненность</div>
            <div className="director-kpi-value">{formatPercent(data.occupancyRate)}</div>
          </div>
          <div className="director-kpi">
            <div className="director-kpi-label">Наличные</div>
            <div className="director-kpi-value">
              {formatMoneyFromKopecks(data.revenueByPaymentMethod.cash)}
            </div>
          </div>
          <div className="director-kpi">
            <div className="director-kpi-label">Карта</div>
            <div className="director-kpi-value">
              {formatMoneyFromKopecks(data.revenueByPaymentMethod.card)}
            </div>
          </div>
          <div className="director-kpi">
            <div className="director-kpi-label">Проходы</div>
            <div className="director-kpi-value">{data.checkInCount}</div>
          </div>
          <div className="director-kpi">
            <div className="director-kpi-label">Отмены / возвраты</div>
            <div className="director-kpi-value">
              {data.cancellationCount} / {data.refundCount}
            </div>
          </div>
        </div>
      ) : null}
      {data?.dailySeries?.length ? (
        <section className="director-panel" style={{ marginTop: "1.25rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>По дням (только оплаченные)</h2>
          <div className="director-table-wrap">
            <table className="director-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Выручка</th>
                  <th>Заказы</th>
                  <th>Проходы</th>
                </tr>
              </thead>
              <tbody>
                {data.dailySeries.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{formatMoneyFromKopecks(row.revenueKopecks)}</td>
                    <td>{row.orderCount}</td>
                    <td>{row.checkIns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
