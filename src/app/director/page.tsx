"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { directorFetch, formatDateTime, formatPercent } from "@/lib/director/client";
import { formatMoneyFromKopecks } from "@/lib/utils";

type AnalyticsSummary = {
  kpis: {
    netRevenueKopecks: number;
    refundedAmountKopecks: number;
    onlineRevenueKopecks: number;
    cashierRevenueKopecks: number;
    paidOrders: number;
    ticketsSold: number;
    averageOrderValueKopecks: number;
    occupancyRate: number;
    checkIns: number;
    noShow: number;
  };
};

type SessionRow = {
  id: string;
  startsAt: string;
  capacity: number;
  _count?: { tickets: number };
  location?: { name: string };
};

export default function DirectorDashboardPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const analytics = await directorFetch<AnalyticsSummary>(
          "/api/director/analytics?preset=today",
        );
        setData(analytics);
        const locs = await directorFetch<{ locations: Array<{ id: string }> }>(
          "/api/director/locations",
        );
        const locationId = locs.locations[0]?.id;
        if (locationId) {
          const sessionsData = await directorFetch<{ sessions: SessionRow[] }>(
            `/api/director/sessions?locationId=${locationId}`,
          );
          setSessions(sessionsData.sessions.slice(0, 8));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      }
    })();
  }, []);

  return (
    <>
      <PageHeader
        title="Обзор"
        description="Ключевые показатели за сегодня (только PAID). Подробности — в Аналитике."
        actions={
          <Link href="/director/analytics" className="director-btn primary">
            Открыть аналитику
          </Link>
        }
      />
      {error ? <div className="director-alert error">{error}</div> : null}
      {!data && !error ? <div className="director-empty">Загрузка KPI…</div> : null}
      {data ? (
        <>
          <div className="director-card-grid">
            <div className="director-kpi">
              <div className="director-kpi-label">Чистая выручка</div>
              <div className="director-kpi-value accent-green">
                {formatMoneyFromKopecks(data.kpis.netRevenueKopecks)}
              </div>
              <div className="director-kpi-sub">
                Возвраты: {formatMoneyFromKopecks(data.kpis.refundedAmountKopecks)}
              </div>
            </div>
            <div className="director-kpi">
              <div className="director-kpi-label">Онлайн / Касса</div>
              <div className="director-kpi-value accent-orange">
                {formatMoneyFromKopecks(data.kpis.onlineRevenueKopecks)}
              </div>
              <div className="director-kpi-sub">
                Касса: {formatMoneyFromKopecks(data.kpis.cashierRevenueKopecks)}
              </div>
            </div>
            <div className="director-kpi">
              <div className="director-kpi-label">Заказы</div>
              <div className="director-kpi-value">{data.kpis.paidOrders}</div>
              <div className="director-kpi-sub">Билетов: {data.kpis.ticketsSold}</div>
            </div>
            <div className="director-kpi">
              <div className="director-kpi-label">Средний чек</div>
              <div className="director-kpi-value">
                {formatMoneyFromKopecks(data.kpis.averageOrderValueKopecks)}
              </div>
            </div>
            <div className="director-kpi">
              <div className="director-kpi-label">Загрузка</div>
              <div className="director-kpi-value">{formatPercent(data.kpis.occupancyRate)}</div>
              <div className="director-kpi-sub">
                Check-in: {data.kpis.checkIns} · No-show: {data.kpis.noShow}
              </div>
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
                    <th>Билеты</th>
                    <th>Capacity</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="director-empty">
                        Нет предстоящих сеансов
                      </td>
                    </tr>
                  ) : (
                    sessions.map((session) => (
                      <tr key={session.id}>
                        <td>{session.location?.name ?? "—"}</td>
                        <td>{formatDateTime(session.startsAt)}</td>
                        <td>{session._count?.tickets ?? 0}</td>
                        <td>{session.capacity}</td>
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
