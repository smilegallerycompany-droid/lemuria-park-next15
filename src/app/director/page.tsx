"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { directorFetch, formatDateTime, formatPercent } from "@/lib/director/client";
import { formatMoneyFromKopecks } from "@/lib/utils";
import type { DirectorAnalytics } from "@/server/services/analytics";

export default function DirectorDashboardPage() {
  const [data, setData] = useState<DirectorAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    directorFetch<DirectorAnalytics>("/api/director/analytics")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"));
  }, []);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Ключевые показатели за сегодня (оплаченные заказы, копейки → рубли в UI)."
      />
      {error ? <div className="director-alert error">{error}</div> : null}
      {!data && !error ? <div className="director-empty">Загрузка KPI…</div> : null}
      {data ? (
        <>
          <div className="director-card-grid">
            <div className="director-kpi">
              <div className="director-kpi-label">Выручка сегодня</div>
              <div className="director-kpi-value accent-green">{formatMoneyFromKopecks(data.netRevenueKopecks)}</div>
              <div className="director-kpi-sub">Возвраты: {formatMoneyFromKopecks(data.refundsKopecks)}</div>
            </div>
            <div className="director-kpi">
              <div className="director-kpi-label">Online / Cashier</div>
              <div className="director-kpi-value accent-orange">
                {formatMoneyFromKopecks(data.revenueBySource.ONLINE)}
              </div>
              <div className="director-kpi-sub">Касса: {formatMoneyFromKopecks(data.revenueBySource.CASHIER)}</div>
            </div>
            <div className="director-kpi">
              <div className="director-kpi-label">Заказы</div>
              <div className="director-kpi-value">{data.orderCount}</div>
              <div className="director-kpi-sub">Билетов: {data.ticketCount}</div>
            </div>
            <div className="director-kpi">
              <div className="director-kpi-label">AOV</div>
              <div className="director-kpi-value">{formatMoneyFromKopecks(data.averageOrderValueKopecks)}</div>
              <div className="director-kpi-sub">Средний чек</div>
            </div>
            <div className="director-kpi">
              <div className="director-kpi-label">Occupancy</div>
              <div className="director-kpi-value">{formatPercent(data.occupancyRate)}</div>
              <div className="director-kpi-sub">Заполненность сеансов за период</div>
            </div>
          </div>

          <section className="director-panel">
            <div className="director-panel-head">
              <h2>Ближайшие сеансы</h2>
              <Link href="/director/sessions" className="director-link">
                Все сеансы
              </Link>
            </div>
            <div className="director-table-wrap">
              <table className="director-table">
                <thead>
                  <tr>
                    <th>Локация</th>
                    <th>Начало</th>
                    <th>Места</th>
                    <th>Свободно</th>
                  </tr>
                </thead>
                <tbody>
                  {data.upcomingSessions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="director-empty">
                        Нет предстоящих сеансов
                      </td>
                    </tr>
                  ) : (
                    data.upcomingSessions.map((session) => (
                      <tr key={session.id}>
                        <td>{session.locationName}</td>
                        <td>{formatDateTime(session.startsAt)}</td>
                        <td>
                          {session.booked}/{session.capacity}
                        </td>
                        <td>{session.available}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
