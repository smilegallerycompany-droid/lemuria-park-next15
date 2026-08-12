"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ErrorAlert,
  EmptyState,
  KpiCard,
  LoadingSkeleton,
  PageHeader,
} from "@/components/internal";
import { directorFetch, formatDateTime, formatPercent } from "@/lib/director/client";
import { formatMoneyFromKopecks } from "@/lib/utils";

type Overview = {
  kpis: {
    netRevenueKopecks: number;
    onlineRevenueKopecks: number;
    cashierRevenueKopecks: number;
    paidOrders: number;
    ticketsSold: number;
    averageOrderValueKopecks: number;
    occupancyRate: number;
    checkIns: number;
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
  charts: {
    revenueByHour: Array<{ hour: string; amount: number }>;
    onlineVsCashier: { online: number; cashier: number };
    paymentMethods: { cash: number; card: number; yookassa: number };
  };
  sessions: Array<{
    id: string;
    startsAt: string;
    sold: number;
    reserved: number;
    free: number;
    occupancy: number;
    status: string;
    location?: { name: string };
  }>;
  alerts: Array<{
    severity: "info" | "warning" | "danger";
    title: string;
    description: string;
    href: string;
  }>;
  shifts?: {
    open: Array<{
      id: string;
      cashierName: string;
      location: string;
      openedAt: string;
      cashSalesAmount: number;
      currentCashBalance?: number;
      ordersCount: number;
    }>;
    closedToday: number;
    withDifference: Array<{
      id: string;
      cashierName: string;
      location: string;
      cashDifferenceAmount: number | null;
    }>;
  };
};

const PIE_COLORS = ["#2f6b45", "#c45c26", "#6b8f71"];

export default function DirectorDashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    directorFetch<Overview>("/api/director/overview")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, []);

  const channelData = data
    ? [
        { name: "Online", value: data.charts.onlineVsCashier.online },
        { name: "Касса", value: data.charts.onlineVsCashier.cashier },
      ]
    : [];
  const methodData = data
    ? [
        { name: "YooKassa", value: data.charts.paymentMethods.yookassa },
        { name: "Карта", value: data.charts.paymentMethods.card },
        { name: "Наличные", value: data.charts.paymentMethods.cash },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Сегодня"
        description="Оперативный обзор за 10 секунд. Только реальные данные из БД."
        actions={
          <Link href="/director/analytics" className="internal-btn primary">
            Аналитика
          </Link>
        }
      />
      {error ? <ErrorAlert message={error} /> : null}
      {loading ? <LoadingSkeleton variant="kpi" count={8} /> : null}

      {data ? (
        <>
          <div className="internal-kpi-grid">
            <KpiCard
              label="Выручка сегодня"
              value={formatMoneyFromKopecks(data.kpis.netRevenueKopecks)}
              comparison={data.comparison?.netRevenueKopecks}
              tone="accent"
              deltaKind="money"
            />
            <KpiCard
              label="Заказы"
              value={String(data.kpis.paidOrders)}
              comparison={data.comparison?.paidOrders}
            />
            <KpiCard
              label="Билеты"
              value={String(data.kpis.ticketsSold)}
              comparison={data.comparison?.ticketsSold}
            />
            <KpiCard
              label="Средний чек"
              value={formatMoneyFromKopecks(data.kpis.averageOrderValueKopecks)}
              comparison={data.comparison?.averageOrderValueKopecks}
              deltaKind="money"
            />
            <KpiCard
              label="Посетили"
              value={String(data.kpis.checkIns)}
              comparison={data.comparison?.checkIns}
            />
            <KpiCard
              label="Загрузка"
              value={formatPercent(data.kpis.occupancyRate)}
              comparison={data.comparison?.occupancyRate}
              deltaKind="percent"
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
          </div>

          {data.shifts ? (
            <section className="internal-panel" style={{ marginBottom: 18 }}>
              <div className="internal-table-head">
                <h3>Смены сегодня</h3>
                <Link href="/director/shifts" className="internal-btn secondary">
                  Все смены
                </Link>
              </div>
              <ul className="director-plain-list" style={{ padding: 12 }}>
                <li>
                  <span>Открытые смены</span>
                  <strong>{data.shifts.open.length}</strong>
                </li>
                <li>
                  <span>Закрыто сегодня</span>
                  <strong>{data.shifts.closedToday}</strong>
                </li>
                <li>
                  <span>С расхождением</span>
                  <strong>{data.shifts.withDifference.length}</strong>
                </li>
              </ul>
              {data.shifts.open.length > 0 ? (
                <div className="internal-table-scroll">
                  <table className="internal-table">
                    <thead>
                      <tr>
                        <th>Кассир</th>
                        <th>Локация</th>
                        <th>С</th>
                        <th>Заказы</th>
                        <th>Наличные в кассе</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.shifts.open.map((s) => (
                        <tr key={s.id}>
                          <td>{s.cashierName}</td>
                          <td>{s.location}</td>
                          <td>{formatDateTime(s.openedAt)}</td>
                          <td className="num tabular-nums">{s.ordersCount}</td>
                          <td className="num tabular-nums">
                            {formatMoneyFromKopecks(s.currentCashBalance ?? s.cashSalesAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}

          {data.alerts.length > 0 ? (
            <section className="internal-panel" style={{ marginBottom: 18 }}>
              <div className="internal-table-head">
                <h3>Требует внимания</h3>
              </div>
              <ul className="internal-alert-list" style={{ padding: 12 }}>
                {data.alerts.map((a) => (
                  <li key={a.title + a.href} className="internal-alert-item" data-severity={a.severity}>
                    <strong>{a.title}</strong>
                    <span>{a.description}</span>
                    <Link href={a.href}>
                      {a.href.includes("/director/shifts/") ? "Открыть смену" : "Открыть →"}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="director-grid-2" style={{ marginBottom: 18 }}>
            <section className="internal-panel">
              <div className="internal-table-head">
                <h3>Выручка по часам</h3>
              </div>
              <div style={{ width: "100%", height: 180, padding: "8px 12px" }}>
                <ResponsiveContainer>
                  <BarChart data={data.charts.revenueByHour.filter((h) => Number(h.hour) >= 8 && Number(h.hour) <= 22)}>
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                    <YAxis hide />
                    <Tooltip
                      formatter={(v) => formatMoneyFromKopecks(Number(v ?? 0))}
                      isAnimationActive={false}
                    />
                    <Bar dataKey="amount" fill="#2f6b45" radius={3} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="internal-panel">
              <div className="internal-table-head">
                <h3>Online vs касса · оплаты</h3>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: 180 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={channelData} dataKey="value" nameKey="name" outerRadius={60} isAnimationActive={false}>
                      {channelData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatMoneyFromKopecks(Number(v ?? 0))} />
                  </PieChart>
                </ResponsiveContainer>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={methodData} dataKey="value" nameKey="name" outerRadius={60} isAnimationActive={false}>
                      {methodData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatMoneyFromKopecks(Number(v ?? 0))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>
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
                    <th>Время</th>
                    <th>Sold</th>
                    <th>Reserved</th>
                    <th>Free</th>
                    <th>Occupancy</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState title="Нет сеансов" description="В ближайшем окне сеансов нет." />
                      </td>
                    </tr>
                  ) : (
                    data.sessions.map((session) => (
                      <tr key={session.id}>
                        <td>{session.location?.name ?? "—"}</td>
                        <td>{formatDateTime(session.startsAt)}</td>
                        <td className="num tabular-nums">{session.sold}</td>
                        <td className="num tabular-nums">{session.reserved}</td>
                        <td className="num tabular-nums">{session.free}</td>
                        <td className="num tabular-nums">{formatPercent(session.occupancy)}</td>
                        <td>{session.status}</td>
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
