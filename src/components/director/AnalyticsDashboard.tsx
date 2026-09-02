"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartCard,
  EmptyState,
  ErrorAlert,
  KpiCard,
  PageHeader,
} from "@/components/internal";
import { directorFetch } from "@/lib/director/client";
import { sortRows, toggleSort, type SortDir } from "@/lib/director/analytics-table";
import { CHART_COLORS, formatRubFromKopecks } from "@/lib/internal/chart-theme";
import { formatMoneyFromKopecks } from "@/lib/utils";
import type { KpiComparison } from "@/server/services/analytics-formulas";

type Report = {
  period: { from: string; to: string; timeZone: string };
  comparisonPeriod: { from: string; to: string };
  kpis: Record<string, number>;
  comparison: Record<string, KpiComparison>;
  revenueSeries: Array<{ date: string; total: number; online: number; cashier: number }>;
  ordersSeries: Array<{ date: string; orders: number; tickets: number }>;
  sourceBreakdown: Array<{ key: string; label: string; valueKopecks: number }>;
  paymentBreakdown: Array<{ key: string; label: string; valueKopecks: number }>;
  timeOccupancy: Array<{ time: string; sold: number; capacity: number; occupancy: number }>;
  weekdayOccupancy: Array<{ weekday: string; sold: number; capacity: number; occupancy: number }>;
  ticketTypeBreakdown: Array<{
    name: string;
    quantity: number;
    revenueKopecks: number;
    avgPriceKopecks: number;
    share: number;
  }>;
  attendance: { checkIns: number; noShow: number; attendanceRate: number };
  cashiers: Array<{
    userId: string;
    name: string;
    orders: number;
    tickets: number;
    cashKopecks: number;
    cardKopecks: number;
    siteKopecks: number;
    revenueKopecks: number;
    aovKopecks: number;
  }>;
  sessions: Array<{
    id: string;
    date: string;
    time: string;
    capacity: number;
    onlineSold: number;
    cashierSold: number;
    totalSold: number;
    checkIns: number;
    available: number;
    occupancy: number;
    revenueKopecks: number;
  }>;
  locations: Array<{
    locationId: string;
    name: string;
    revenueKopecks: number;
    tickets: number;
    orders: number;
    aovKopecks: number;
    checkIns: number;
  }>;
  heatmap: Array<{ weekday: string; time: string; occupancy: number }>;
  filters: {
    locationId: string | null;
    source: string;
    paymentMethod: string;
    ticketTypeId: string | null;
    cashierId: string | null;
    timezone: string;
    preset: string;
  };
};

const PRESETS = [
  { id: "today", label: "Сегодня" },
  { id: "yesterday", label: "Вчера" },
  { id: "last_7", label: "7 дней" },
  { id: "last_30", label: "30 дней" },
  { id: "this_month", label: "Этот месяц" },
  { id: "prev_month", label: "Прошлый месяц" },
  { id: "custom", label: "Произвольный" },
] as const;

function pct(value: number) {
  // API rates are 0..1
  return `${(value * 100).toFixed(1)}%`;
}

function toCsv(rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]!);
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [keys.join(","), ...rows.map((row) => keys.map((k) => escape(row[k] ?? "")).join(","))].join(
    "\n",
  );
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AnalyticsDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [ticketTypes, setTicketTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [sessionPage, setSessionPage] = useState(0);
  const [sessionSort, setSessionSort] = useState<{ key: string | null; dir: SortDir }>({
    key: "date",
    dir: "asc",
  });
  const [cashierSort, setCashierSort] = useState<{ key: string | null; dir: SortDir }>({
    key: "revenueKopecks",
    dir: "desc",
  });
  const [ticketSort, setTicketSort] = useState<{ key: string | null; dir: SortDir }>({
    key: "revenueKopecks",
    dir: "desc",
  });
  const [locationSort, setLocationSort] = useState<{ key: string | null; dir: SortDir }>({
    key: "revenueKopecks",
    dir: "desc",
  });
  const pageSize = 10;

  const queryString = searchParams.toString();

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "" || value === "ALL") next.delete(key);
        else next.set(key, value);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    Promise.all([
      directorFetch<{ locations: Array<{ id: string; name: string }> }>("/api/director/locations"),
      directorFetch<{ ticketTypes: Array<{ id: string; name: string }> }>("/api/director/ticket-types"),
      directorFetch<{ staff: Array<{ id: string; name: string; role: string }> }>("/api/director/staff"),
    ])
      .then(([locs, types, staffData]) => {
        setLocations(locs.locations);
        setTicketTypes(types.ticketTypes);
        setStaff(staffData.staff.filter((s) => s.role === "CASHIER" || s.role === "ADMIN"));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams(queryString);
    if (!params.get("preset") && !params.get("from")) params.set("preset", "today");
    directorFetch<Report>(`/api/director/analytics?${params}`)
      .then((report) => {
        if (!cancelled) setData(report);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  const kpis = data?.kpis;
  const comparison = data?.comparison;

  const heatmapGrid = useMemo(() => {
    if (!data?.heatmap?.length) return { times: [] as string[], weekdays: [] as string[], map: new Map<string, number>() };
    const times = Array.from(new Set(data.heatmap.map((h) => h.time))).sort();
    const weekdays = Array.from(new Set(data.heatmap.map((h) => h.weekday)));
    const map = new Map(data.heatmap.map((h) => [`${h.weekday}|${h.time}`, h.occupancy]));
    return { times, weekdays, map };
  }, [data]);

  function exportSessionsCsv() {
    if (!data) return;
    downloadCsv(
      "sessions-analytics.csv",
      sortedSessions.map((s) => ({
        date: s.date,
        time: s.time,
        capacity: s.capacity,
        online: s.onlineSold,
        cashier: s.cashierSold,
        sold: s.totalSold,
        checkIns: s.checkIns,
        available: s.available,
        occupancy: (s.occupancy * 100).toFixed(1),
        revenueRub: (s.revenueKopecks / 100).toFixed(2),
      })),
    );
  }

  function exportCashiersCsv() {
    if (!data) return;
    downloadCsv(
      "cashiers-analytics.csv",
      sortedCashiers.map((c) => ({
        name: c.name,
        orders: c.orders,
        tickets: c.tickets,
        cashRub: (c.cashKopecks / 100).toFixed(2),
        cardRub: (c.cardKopecks / 100).toFixed(2),
        siteRub: (c.siteKopecks / 100).toFixed(2),
        revenueRub: (c.revenueKopecks / 100).toFixed(2),
        aovRub: (c.aovKopecks / 100).toFixed(2),
      })),
    );
  }

  function exportTicketTypesCsv() {
    if (!data) return;
    downloadCsv(
      "ticket-types-analytics.csv",
      sortedTickets.map((row) => ({
        name: row.name,
        quantity: row.quantity,
        revenueRub: (row.revenueKopecks / 100).toFixed(2),
        avgPriceRub: (row.avgPriceKopecks / 100).toFixed(2),
        sharePct: (row.share * 100).toFixed(1),
      })),
    );
  }

  function exportLocationsCsv() {
    if (!data) return;
    downloadCsv(
      "locations-analytics.csv",
      sortedLocations.map((row) => ({
        name: row.name,
        orders: row.orders,
        tickets: row.tickets,
        checkIns: row.checkIns,
        revenueRub: (row.revenueKopecks / 100).toFixed(2),
        aovRub: (row.aovKopecks / 100).toFixed(2),
      })),
    );
  }

  const sortedSessions = useMemo(
    () =>
      sortRows(
        data?.sessions ?? [],
        sessionSort.key as keyof NonNullable<Report["sessions"]>[number] | null,
        sessionSort.dir,
      ),
    [data?.sessions, sessionSort],
  );
  const sortedCashiers = useMemo(
    () =>
      sortRows(
        data?.cashiers ?? [],
        cashierSort.key as keyof NonNullable<Report["cashiers"]>[number] | null,
        cashierSort.dir,
      ),
    [data?.cashiers, cashierSort],
  );
  const sortedTickets = useMemo(
    () =>
      sortRows(
        data?.ticketTypeBreakdown ?? [],
        ticketSort.key as keyof NonNullable<Report["ticketTypeBreakdown"]>[number] | null,
        ticketSort.dir,
      ),
    [data?.ticketTypeBreakdown, ticketSort],
  );
  const sortedLocations = useMemo(
    () =>
      sortRows(
        data?.locations ?? [],
        locationSort.key as keyof NonNullable<Report["locations"]>[number] | null,
        locationSort.dir,
      ),
    [data?.locations, locationSort],
  );

  const pagedSessions = sortedSessions.slice(
    sessionPage * pageSize,
    sessionPage * pageSize + pageSize,
  );

  return (
    <div className="internal-analytics">
      <PageHeader
        title="Аналитика"
        description={`Только оплаченные заказы. Часовой пояс: ${data?.filters.timezone ?? "Europe/Moscow"}. Все значения из базы.`}
        actions={
          <button
            type="button"
            className="internal-btn secondary"
            onClick={() => router.replace(pathname)}
          >
            Сбросить
          </button>
        }
      />

      <section className="internal-filter-bar" aria-label="Фильтры аналитики">
        <div className="internal-preset-row">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={
                (searchParams.get("preset") ?? "today") === preset.id ? "active" : undefined
              }
              onClick={() => updateParams({ preset: preset.id })}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {(searchParams.get("preset") ?? "") === "custom" ? (
          <div className="internal-filter-row">
            <label>
              С
              <input
                type="date"
                value={searchParams.get("from")?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  updateParams({
                    from: e.target.value ? new Date(`${e.target.value}T00:00:00+03:00`).toISOString() : null,
                    preset: "custom",
                  })
                }
              />
            </label>
            <label>
              По
              <input
                type="date"
                value={searchParams.get("to")?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  updateParams({
                    to: e.target.value ? new Date(`${e.target.value}T23:59:59+03:00`).toISOString() : null,
                    preset: "custom",
                  })
                }
              />
            </label>
          </div>
        ) : null}
        <div className="internal-filter-row">
          <label>
            Локация
            <select
              value={searchParams.get("locationId") ?? ""}
              onChange={(e) => updateParams({ locationId: e.target.value || null })}
            >
              <option value="">Все доступные</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Источник
            <select
              value={searchParams.get("source") ?? "ALL"}
              onChange={(e) => updateParams({ source: e.target.value })}
            >
              <option value="ALL">Все</option>
              <option value="ONLINE">Онлайн</option>
              <option value="CASHIER">Касса</option>
            </select>
          </label>
          <label>
            Оплата
            <select
              value={searchParams.get("paymentMethod") ?? "ALL"}
              onChange={(e) => updateParams({ paymentMethod: e.target.value })}
            >
              <option value="ALL">Все</option>
              <option value="CASH">Наличные</option>
              <option value="CARD">Карта</option>
              <option value="YOOKASSA">ЮKassa / Сайт</option>
            </select>
          </label>
          <label>
            Тип билета
            <select
              value={searchParams.get("ticketTypeId") ?? ""}
              onChange={(e) => updateParams({ ticketTypeId: e.target.value || null })}
            >
              <option value="">Все</option>
              {ticketTypes.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Кассир
            <select
              value={searchParams.get("cashierId") ?? ""}
              onChange={(e) => updateParams({ cashierId: e.target.value || null })}
            >
              <option value="">Все</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? <ErrorAlert message={error} /> : null}

      <section className="internal-kpi-grid" aria-label="Показатели">
        <KpiCard
          label="Валовая выручка"
          value={formatMoneyFromKopecks(kpis?.grossRevenueKopecks ?? 0)}
          comparison={comparison?.grossRevenueKopecks}
          formula="Сумма оплаченных заказов до возвратов"
          loading={loading}
          deltaKind="money"
        />
        <KpiCard
          label="Возвраты"
          value={formatMoneyFromKopecks(kpis?.refundedAmountKopecks ?? 0)}
          comparison={comparison?.refundedAmountKopecks}
          formula="Завершённые возвраты"
          tone="danger"
          loading={loading}
          deltaKind="money"
        />
        <KpiCard
          label="Чистая выручка"
          value={formatMoneyFromKopecks(kpis?.netRevenueKopecks ?? 0)}
          comparison={comparison?.netRevenueKopecks}
          formula="Чистая выручка − возвраты"
          loading={loading}
          deltaKind="money"
        />
        <KpiCard
          label="Оплаченные заказы"
          value={String(kpis?.paidOrders ?? 0)}
          comparison={comparison?.paidOrders}
          loading={loading}
        />
        <KpiCard
          label="Проданные билеты"
          value={String(kpis?.ticketsSold ?? 0)}
          comparison={comparison?.ticketsSold}
          loading={loading}
        />
        <KpiCard
          label="Средний чек"
          value={formatMoneyFromKopecks(kpis?.averageOrderValueKopecks ?? 0)}
          comparison={comparison?.averageOrderValueKopecks}
          formula="Чистая / оплаченные заказы"
          loading={loading}
          deltaKind="money"
        />
        <KpiCard
          label="Средняя цена билета"
          value={formatMoneyFromKopecks(kpis?.averageTicketPriceKopecks ?? 0)}
          comparison={comparison?.averageTicketPriceKopecks}
          formula="Чистая / проданные билеты"
          loading={loading}
          deltaKind="money"
        />
        <KpiCard
          label="Проходы"
          value={String(kpis?.checkIns ?? 0)}
          comparison={comparison?.checkIns}
          formula="Только успешный проход"
          loading={loading}
        />
        <KpiCard
          label="Сканы возвратов"
          value={String(kpis?.checkInsRefunded ?? 0)}
          comparison={comparison?.checkInsRefunded}
          formula="Сканы билетов со статусом «возврат»"
          loading={loading}
        />
        <KpiCard
          label="Посещаемость"
          value={pct(kpis?.attendanceRate ?? 0)}
          comparison={comparison?.attendanceRate}
          formula="Проходы / действующие билеты"
          loading={loading}
          deltaKind="percent"
        />
        <KpiCard
          label="Загрузка сеансов"
          value={pct(kpis?.occupancyRate ?? 0)}
          comparison={comparison?.occupancyRate}
          formula="Оплаченные места / вместимость"
          loading={loading}
          deltaKind="percent"
        />
        <KpiCard
          label="Онлайн-выручка"
          value={formatMoneyFromKopecks(kpis?.onlineRevenueKopecks ?? 0)}
          comparison={comparison?.onlineRevenueKopecks}
          loading={loading}
          deltaKind="money"
        />
        <KpiCard
          label="Выручка кассы"
          value={formatMoneyFromKopecks(kpis?.cashierRevenueKopecks ?? 0)}
          comparison={comparison?.cashierRevenueKopecks}
          loading={loading}
          deltaKind="money"
        />
        <KpiCard
          label="Наличные"
          value={formatMoneyFromKopecks(kpis?.cashKopecks ?? 0)}
          comparison={comparison?.cashKopecks}
          loading={loading}
          deltaKind="money"
        />
        <KpiCard
          label="Карта"
          value={formatMoneyFromKopecks(kpis?.cardKopecks ?? 0)}
          comparison={comparison?.cardKopecks}
          loading={loading}
          deltaKind="money"
        />
        <KpiCard
          label="ЮKassa / Сайт"
          value={formatMoneyFromKopecks(kpis?.yookassaKopecks ?? 0)}
          comparison={comparison?.yookassaKopecks}
          loading={loading}
          deltaKind="money"
        />
        <KpiCard
          label="Отменённые заказы"
          value={String(kpis?.cancelledOrders ?? 0)}
          comparison={comparison?.cancelledOrders}
          loading={loading}
        />
        <KpiCard
          label="Возвращённые заказы"
          value={String(kpis?.refundedOrders ?? 0)}
          comparison={comparison?.refundedOrders}
          tone="danger"
          loading={loading}
        />
        <KpiCard
          label="Не пришли"
          value={String(kpis?.noShow ?? 0)}
          comparison={comparison?.noShow}
          tone="warning"
          formula="Действительные билеты прошедших сеансов без успешного прохода"
          loading={loading}
        />
        <KpiCard
          label="Конверсия броней"
          value={pct(kpis?.reservationConversionRate ?? 0)}
          comparison={comparison?.reservationConversionRate}
          formula="Оплачено из броней / созданные брони"
          loading={loading}
          deltaKind="percent"
        />
      </section>

      <section className="internal-charts-grid">
        <ChartCard title="Выручка по дням" loading={loading} empty={!data?.revenueSeries.length}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data?.revenueSeries ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ebe3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 100)}`} width={60} />
              <Tooltip formatter={(v) => formatRubFromKopecks(Number(v))} />
              <Legend />
              <Line isAnimationActive={false} type="monotone" dataKey="total" name="Всего" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
              <Line isAnimationActive={false} type="monotone" dataKey="online" name="Онлайн" stroke={CHART_COLORS.secondary} strokeWidth={2} dot={false} />
              <Line isAnimationActive={false} type="monotone" dataKey="cashier" name="Касса" stroke={CHART_COLORS.accent} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Заказы и билеты" loading={loading} empty={!data?.ordersSeries.length}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data?.ordersSeries ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ebe3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar isAnimationActive={false} dataKey="orders" name="Заказы" fill={CHART_COLORS.primary} radius={4} />
              <Bar isAnimationActive={false} dataKey="tickets" name="Билеты" fill={CHART_COLORS.accent} radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Источники продаж"
          loading={loading}
          empty={!data?.sourceBreakdown.some((x) => x.valueKopecks > 0)}
        >
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie isAnimationActive={false}
                data={data?.sourceBreakdown ?? []}
                dataKey="valueKopecks"
                nameKey="label"
                innerRadius={55}
                outerRadius={90}
              >
                {(data?.sourceBreakdown ?? []).map((entry, i) => (
                  <Cell
                    key={entry.key}
                    fill={i === 0 ? CHART_COLORS.primary : CHART_COLORS.accent}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatRubFromKopecks(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Способы оплаты"
          loading={loading}
          empty={!data?.paymentBreakdown.some((x) => x.valueKopecks > 0)}
        >
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie isAnimationActive={false}
                data={data?.paymentBreakdown ?? []}
                dataKey="valueKopecks"
                nameKey="label"
                innerRadius={55}
                outerRadius={90}
              >
                {(data?.paymentBreakdown ?? []).map((entry, i) => (
                  <Cell
                    key={entry.key}
                    fill={[CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.accent][i % 3]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatRubFromKopecks(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Загрузка по времени" loading={loading} empty={!data?.timeOccupancy.length}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data?.timeOccupancy ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ebe3" />
              <XAxis dataKey="time" />
              <YAxis tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} />
              <Tooltip formatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} />
              <Bar isAnimationActive={false} dataKey="occupancy" name="Загрузка" fill={CHART_COLORS.primary} radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Загрузка по дням недели" loading={loading} empty={!data?.weekdayOccupancy.length}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data?.weekdayOccupancy ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ebe3" />
              <XAxis dataKey="weekday" />
              <YAxis tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} />
              <Tooltip formatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} />
              <Bar isAnimationActive={false} dataKey="occupancy" name="Загрузка" fill={CHART_COLORS.secondary} radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Типы билетов"
          loading={loading}
          empty={!data?.ticketTypeBreakdown.length}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data?.ticketTypeBreakdown ?? []} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ebe3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={80} />
              <Tooltip />
              <Bar isAnimationActive={false} dataKey="quantity" name="Кол-во" fill={CHART_COLORS.primary} radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Проходы и не явившиеся" loading={loading} empty={!data}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={[
                { name: "Проходы", value: data?.attendance.checkIns ?? 0 },
                { name: "Не пришли", value: data?.attendance.noShow ?? 0 },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ebe3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar isAnimationActive={false} dataKey="value" radius={4}>
                <Cell fill={CHART_COLORS.primary} />
                <Cell fill={CHART_COLORS.accent} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {(data?.locations.length ?? 0) > 1 ? (
          <ChartCard title="Выручка по локациям" loading={loading}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.locations ?? []} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5ebe3" />
                <XAxis type="number" tickFormatter={(v) => String(Math.round(Number(v) / 100))} />
                <YAxis type="category" dataKey="name" width={100} />
                <Tooltip formatter={(v) => formatRubFromKopecks(Number(v))} />
                <Bar isAnimationActive={false} dataKey="revenueKopecks" name="Выручка" fill={CHART_COLORS.primary} radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        <ChartCard title="Продажи по кассирам" loading={loading} empty={!data?.cashiers.length}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data?.cashiers ?? []} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ebe3" />
              <XAxis type="number" tickFormatter={(v) => String(Math.round(Number(v) / 100))} />
              <YAxis type="category" dataKey="name" width={100} />
              <Tooltip formatter={(v) => formatRubFromKopecks(Number(v))} />
              <Bar isAnimationActive={false} dataKey="revenueKopecks" name="Выручка" fill={CHART_COLORS.accent} radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="internal-chart-card">
        <h3>Тепловая карта загрузки</h3>
        {loading ? <div className="internal-skeleton-block" /> : null}
        {!loading && !heatmapGrid.times.length ? (
          <div className="internal-empty">Нет данных за период</div>
        ) : null}
        {!loading && heatmapGrid.times.length ? (
          <div className="internal-heatmap" role="table" aria-label="Тепловая карта загрузки">
            <div className="internal-heatmap-row header">
              <div />
              {heatmapGrid.times.map((t) => (
                <div key={t} className="internal-heatmap-cell label">
                  {t}
                </div>
              ))}
            </div>
            {heatmapGrid.weekdays.map((day) => (
              <div key={day} className="internal-heatmap-row">
                <div className="internal-heatmap-cell label">{day}</div>
                {heatmapGrid.times.map((t) => {
                  const value = heatmapGrid.map.get(`${day}|${t}`) ?? 0;
                  const intensity = Math.min(1, value);
                  return (
                    <div
                      key={`${day}-${t}`}
                      className="internal-heatmap-cell"
                      title={`${day} ${t}: ${(value * 100).toFixed(0)}%`}
                      style={{
                        background: `rgba(31, 107, 69, ${0.08 + intensity * 0.75})`,
                      }}
                    >
                      {value > 0 ? `${Math.round(value * 100)}%` : "—"}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="internal-table-card">
        <div className="internal-table-head">
          <h3>Сеансы</h3>
          <button type="button" className="internal-btn secondary" onClick={exportSessionsCsv}>
            CSV
          </button>
        </div>
        <div className="internal-table-scroll">
          <table className="internal-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="internal-sort" onClick={() => setSessionSort((s) => toggleSort(s.key, s.dir, "date"))}>
                    Дата
                  </button>
                </th>
                <th>
                  <button type="button" className="internal-sort" onClick={() => setSessionSort((s) => toggleSort(s.key, s.dir, "time"))}>
                    Время
                  </button>
                </th>
                <th>
                  <button type="button" className="internal-sort" onClick={() => setSessionSort((s) => toggleSort(s.key, s.dir, "capacity"))}>
                    Вместимость
                  </button>
                </th>
                <th>Онлайн</th>
                <th>Касса</th>
                <th>
                  <button type="button" className="internal-sort" onClick={() => setSessionSort((s) => toggleSort(s.key, s.dir, "totalSold"))}>
                    Всего
                  </button>
                </th>
                <th>Проходы</th>
                <th>Свободно</th>
                <th>
                  <button type="button" className="internal-sort" onClick={() => setSessionSort((s) => toggleSort(s.key, s.dir, "occupancy"))}>
                    Загрузка
                  </button>
                </th>
                <th className="num">
                  <button type="button" className="internal-sort" onClick={() => setSessionSort((s) => toggleSort(s.key, s.dir, "revenueKopecks"))}>
                    Выручка
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedSessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.date}</td>
                  <td>{s.time}</td>
                  <td>{s.capacity}</td>
                  <td>{s.onlineSold}</td>
                  <td>{s.cashierSold}</td>
                  <td>{s.totalSold}</td>
                  <td>{s.checkIns}</td>
                  <td>{s.available}</td>
                  <td>{pct(s.occupancy)}</td>
                  <td className="num tabular-nums">{formatMoneyFromKopecks(s.revenueKopecks)}</td>
                </tr>
              ))}
              {!pagedSessions.length && !loading ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState title="Нет сеансов" description="За период сеансы не найдены." />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="internal-pagination">
          <button
            type="button"
            disabled={sessionPage === 0}
            onClick={() => setSessionPage((p) => Math.max(0, p - 1))}
          >
            Назад
          </button>
          <span>
            Стр. {sessionPage + 1} /{" "}
            {Math.max(1, Math.ceil((data?.sessions.length ?? 0) / pageSize))}
          </span>
          <button
            type="button"
            disabled={(sessionPage + 1) * pageSize >= (data?.sessions.length ?? 0)}
            onClick={() => setSessionPage((p) => p + 1)}
          >
            Далее
          </button>
        </div>
      </section>

      <section className="internal-table-card">
        <div className="internal-table-head">
          <h3>Кассиры</h3>
          <button type="button" className="internal-btn secondary" onClick={exportCashiersCsv}>
            CSV
          </button>
        </div>
        <div className="internal-table-scroll">
          <table className="internal-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="internal-sort" onClick={() => setCashierSort((s) => toggleSort(s.key, s.dir, "name"))}>
                    Сотрудник
                  </button>
                </th>
                <th>
                  <button type="button" className="internal-sort" onClick={() => setCashierSort((s) => toggleSort(s.key, s.dir, "orders"))}>
                    Заказы
                  </button>
                </th>
                <th>
                  <button type="button" className="internal-sort" onClick={() => setCashierSort((s) => toggleSort(s.key, s.dir, "tickets"))}>
                    Билеты
                  </button>
                </th>
                <th className="num">Наличные</th>
                <th className="num">Карта</th>
                <th className="num">Сайт</th>
                <th className="num">
                  <button type="button" className="internal-sort" onClick={() => setCashierSort((s) => toggleSort(s.key, s.dir, "revenueKopecks"))}>
                    Выручка
                  </button>
                </th>
                <th className="num">Средний чек</th>
              </tr>
            </thead>
            <tbody>
              {sortedCashiers.map((c) => (
                <tr key={c.userId}>
                  <td>{c.name}</td>
                  <td>{c.orders}</td>
                  <td>{c.tickets}</td>
                  <td className="num">{formatMoneyFromKopecks(c.cashKopecks)}</td>
                  <td className="num">{formatMoneyFromKopecks(c.cardKopecks)}</td>
                  <td className="num">{formatMoneyFromKopecks(c.siteKopecks)}</td>
                  <td className="num">{formatMoneyFromKopecks(c.revenueKopecks)}</td>
                  <td className="num">{formatMoneyFromKopecks(c.aovKopecks)}</td>
                </tr>
              ))}
              {!sortedCashiers.length && !loading ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title="Нет продаж кассиров" />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="internal-table-card">
        <div className="internal-table-head">
          <h3>Типы билетов</h3>
          <button type="button" className="internal-btn secondary" onClick={exportTicketTypesCsv}>
            CSV
          </button>
        </div>
        <div className="internal-table-scroll">
          <table className="internal-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="internal-sort" onClick={() => setTicketSort((s) => toggleSort(s.key, s.dir, "name"))}>
                    Название
                  </button>
                </th>
                <th>
                  <button type="button" className="internal-sort" onClick={() => setTicketSort((s) => toggleSort(s.key, s.dir, "quantity"))}>
                    Кол-во
                  </button>
                </th>
                <th className="num">
                  <button type="button" className="internal-sort" onClick={() => setTicketSort((s) => toggleSort(s.key, s.dir, "revenueKopecks"))}>
                    Выручка
                  </button>
                </th>
                <th className="num">Средняя цена</th>
                <th>Доля</th>
              </tr>
            </thead>
            <tbody>
              {sortedTickets.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.quantity}</td>
                  <td className="num">{formatMoneyFromKopecks(row.revenueKopecks)}</td>
                  <td className="num">{formatMoneyFromKopecks(row.avgPriceKopecks)}</td>
                  <td>{pct(row.share)}</td>
                </tr>
              ))}
              {!sortedTickets.length && !loading ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState title="Нет продаж по типам" />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="internal-table-card">
        <div className="internal-table-head">
          <h3>Локации</h3>
          <button type="button" className="internal-btn secondary" onClick={exportLocationsCsv}>
            CSV
          </button>
        </div>
        <div className="internal-table-scroll">
          <table className="internal-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="internal-sort" onClick={() => setLocationSort((s) => toggleSort(s.key, s.dir, "name"))}>
                    Локация
                  </button>
                </th>
                <th>
                  <button type="button" className="internal-sort" onClick={() => setLocationSort((s) => toggleSort(s.key, s.dir, "orders"))}>
                    Заказы
                  </button>
                </th>
                <th>
                  <button type="button" className="internal-sort" onClick={() => setLocationSort((s) => toggleSort(s.key, s.dir, "tickets"))}>
                    Билеты
                  </button>
                </th>
                <th>Проходы</th>
                <th className="num">
                  <button type="button" className="internal-sort" onClick={() => setLocationSort((s) => toggleSort(s.key, s.dir, "revenueKopecks"))}>
                    Выручка
                  </button>
                </th>
                <th className="num">Средний чек</th>
              </tr>
            </thead>
            <tbody>
              {sortedLocations.map((row) => (
                <tr key={row.locationId}>
                  <td>{row.name}</td>
                  <td>{row.orders}</td>
                  <td>{row.tickets}</td>
                  <td>{row.checkIns}</td>
                  <td className="num">{formatMoneyFromKopecks(row.revenueKopecks)}</td>
                  <td className="num">{formatMoneyFromKopecks(row.aovKopecks)}</td>
                </tr>
              ))}
              {!sortedLocations.length && !loading ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState title="Нет данных по локациям" />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
