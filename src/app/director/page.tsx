"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ErrorAlert,
  EmptyState,
  KpiCard,
  LoadingSkeleton,
  PageHeader,
} from "@/components/internal";
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
  comparison?: Record<
    string,
    {
      current: number;
      previous: number;
      absolute: number;
      percent: number | null;
      label: "ok" | "no_baseline" | "new";
    }
  >;
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
  const [loading, setLoading] = useState(true);

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
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <PageHeader
        title="Обзор"
        description="Ключевые показатели за сегодня. Только оплаченные заказы из БД."
        actions={
          <Link href="/director/analytics" className="internal-btn primary">
            Открыть аналитику
          </Link>
        }
      />
      {error ? <ErrorAlert message={error} /> : null}
      {loading ? <LoadingSkeleton variant="kpi" count={5} /> : null}
      {data ? (
        <>
          <div className="internal-kpi-grid">
            <KpiCard
              label="Чистая выручка"
              value={formatMoneyFromKopecks(data.kpis.netRevenueKopecks)}
              comparison={data.comparison?.netRevenueKopecks}
              formula="Gross − Refunded (PAID)"
              tone="accent"
              deltaKind="money"
            />
            <KpiCard
              label="Онлайн"
              value={formatMoneyFromKopecks(data.kpis.onlineRevenueKopecks)}
              comparison={data.comparison?.onlineRevenueKopecks}
              deltaKind="money"
            />
            <KpiCard
              label="Касса"
              value={formatMoneyFromKopecks(data.kpis.cashierRevenueKopecks)}
              comparison={data.comparison?.cashierRevenueKopecks}
              tone="accent"
              deltaKind="money"
            />
            <KpiCard
              label="Заказы / билеты"
              value={`${data.kpis.paidOrders} / ${data.kpis.ticketsSold}`}
              comparison={data.comparison?.paidOrders}
            />
            <KpiCard
              label="Средний чек"
              value={formatMoneyFromKopecks(data.kpis.averageOrderValueKopecks)}
              comparison={data.comparison?.averageOrderValueKopecks}
              formula="Net / Paid Orders"
              deltaKind="money"
            />
            <KpiCard
              label="Загрузка"
              value={formatPercent(data.kpis.occupancyRate)}
              comparison={data.comparison?.occupancyRate}
              formula="Оплаченные места / capacity"
              deltaKind="percent"
            />
            <KpiCard
              label="Check-in"
              value={String(data.kpis.checkIns)}
              comparison={data.comparison?.checkIns}
            />
            <KpiCard
              label="No-show"
              value={String(data.kpis.noShow)}
              comparison={data.comparison?.noShow}
              tone="warning"
            />
            <KpiCard
              label="Возвраты"
              value={formatMoneyFromKopecks(data.kpis.refundedAmountKopecks)}
              comparison={data.comparison?.refundedAmountKopecks}
              tone="danger"
              deltaKind="money"
            />
          </div>

          <section className="internal-panel">
            <div className="internal-table-head">
              <h3>Ближайшие сеансы</h3>
              <Link href="/director/sessions" className="internal-btn secondary">
                Все сеансы
              </Link>
            </div>
            <div className="internal-table-scroll">
              <table className="internal-table">
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
                      <td colSpan={4}>
                        <EmptyState
                          title="Нет сеансов"
                          description="В ближайшем окне сеансов нет."
                        />
                      </td>
                    </tr>
                  ) : (
                    sessions.map((session) => (
                      <tr key={session.id}>
                        <td>{session.location?.name ?? "—"}</td>
                        <td>{formatDateTime(session.startsAt)}</td>
                        <td className="num tabular-nums">{session._count?.tickets ?? 0}</td>
                        <td className="num tabular-nums">{session.capacity}</td>
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
