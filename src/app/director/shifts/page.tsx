"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard, PageHeader } from "@/components/internal";
import { directorFetch, formatDateTime } from "@/lib/director/client";
import { useStaffBasePath } from "@/lib/staff-portal";
import { formatMoneyFromKopecks } from "@/lib/utils";

type ShiftRow = {
  id: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  cashier: { id?: string; name: string };
  location: { id?: string; city: string; name: string };
  revenue: number;
  cashSalesAmount: number;
  cardSalesAmount: number;
  cashDifferenceAmount: number | null;
  ordersCount: number;
};

type LocationOpt = { id: string; name: string; city: string };
type StaffOpt = { id: string; name: string; role: string };

function moscowDayStart(offsetDays = 0) {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  local.setDate(local.getDate() + offsetDays);
  local.setHours(0, 0, 0, 0);
  const iso = new Date(local.getTime() - local.getTimezoneOffset() * 60000);
  return iso.toISOString().slice(0, 10);
}

export default function DirectorShiftsPage() {
  const base = useStaffBasePath();
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "custom">("today");
  const [from, setFrom] = useState(moscowDayStart(0));
  const [to, setTo] = useState(moscowDayStart(1));
  const [locationId, setLocationId] = useState("");
  const [cashierId, setCashierId] = useState("");
  const [status, setStatus] = useState("");
  const [differenceOnly, setDifferenceOnly] = useState(false);
  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [staff, setStaff] = useState<StaffOpt[]>([]);

  useEffect(() => {
    directorFetch<{ locations: LocationOpt[] }>("/api/director/locations")
      .then((d) => setLocations(d.locations))
      .catch(() => undefined);
    directorFetch<{ staff: StaffOpt[] }>("/api/director/staff")
      .then((d) => setStaff(d.staff.filter((s) => s.role === "CASHIER" || s.role === "ADMIN")))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (period === "today") {
      setFrom(moscowDayStart(0));
      setTo(moscowDayStart(1));
    } else if (period === "7d") {
      setFrom(moscowDayStart(-6));
      setTo(moscowDayStart(1));
    } else if (period === "30d") {
      setFrom(moscowDayStart(-29));
      setTo(moscowDayStart(1));
    }
  }, [period]);

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (from) q.set("from", `${from}T00:00:00+03:00`);
    if (to) q.set("to", `${to}T00:00:00+03:00`);
    if (locationId) q.set("locationId", locationId);
    if (cashierId) q.set("cashierId", cashierId);
    if (status) q.set("status", status);
    if (differenceOnly) q.set("difference", "1");
    directorFetch<{ shifts: ShiftRow[] }>(`/api/director/shifts?${q.toString()}`)
      .then((d) => setShifts(d.shifts))
      .catch(() => undefined);
  }, [from, to, locationId, cashierId, status, differenceOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => {
    const openNow = shifts.filter((s) => s.status === "OPEN").length;
    const closedToday = shifts.filter((s) => s.status !== "OPEN").length;
    const revenue = shifts.reduce((n, s) => n + s.revenue, 0);
    const cash = shifts.reduce((n, s) => n + s.cashSalesAmount, 0);
    const diffs = shifts.filter((s) => s.cashDifferenceAmount != null && s.cashDifferenceAmount !== 0);
    return { openNow, closedToday, revenue, cash, diffs: diffs.length };
  }, [shifts]);

  return (
    <>
      <PageHeader
        title="Смены"
        description="Контроль открытых смен, выручки и расхождений по наличным."
      />

      <div className="internal-kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard label="Открытые сейчас" value={String(kpis.openNow)} />
        <KpiCard label="Закрыты в выборке" value={String(kpis.closedToday)} />
        <KpiCard label="Выручка смен" value={formatMoneyFromKopecks(kpis.revenue)} />
        <KpiCard label="Наличные" value={formatMoneyFromKopecks(kpis.cash)} />
        <KpiCard
          label="Расхождения"
          value={String(kpis.diffs)}
          tone={kpis.diffs > 0 ? "warning" : undefined}
        />
      </div>

      <section className="internal-filter-bar no-print" aria-label="Фильтры смен">
        <div className="internal-preset-row">
          {(
            [
              ["today", "Сегодня"],
              ["7d", "7 дней"],
              ["30d", "30 дней"],
              ["custom", "Custom"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={period === id ? "active" : undefined}
              onClick={() => setPeriod(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="internal-filter-row">
          {period === "custom" ? (
            <>
              <label>
                С
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label>
                По
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </>
          ) : null}
          <label>
            Локация
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Все локации</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.city} — {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Кассир
            <select value={cashierId} onChange={(e) => setCashierId(e.target.value)}>
              <option value="">Все кассиры</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Статус
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Open / Closed</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
              <option value="FORCE_CLOSED">Force closed</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={differenceOnly}
              onChange={(e) => setDifferenceOnly(e.target.checked)}
            />
            Only differences
          </label>
        </div>
      </section>

      <div className="director-table-wrap">
        <table className="director-table">
          <thead>
            <tr>
              <th>Кассир</th>
              <th>Локация</th>
              <th>Начало</th>
              <th>Конец</th>
              <th>Наличные</th>
              <th>Карта</th>
              <th>Заказы</th>
              <th>Difference</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`${base}/shifts/${s.id}`}>{s.cashier.name}</Link>
                </td>
                <td>
                  {s.location.city} — {s.location.name}
                </td>
                <td>{formatDateTime(s.openedAt)}</td>
                <td>{s.closedAt ? formatDateTime(s.closedAt) : "—"}</td>
                <td className="tabular-nums">{formatMoneyFromKopecks(s.cashSalesAmount)}</td>
                <td className="tabular-nums">{formatMoneyFromKopecks(s.cardSalesAmount)}</td>
                <td className="tabular-nums">{s.ordersCount}</td>
                <td
                  className={`tabular-nums ${
                    s.cashDifferenceAmount == null || s.cashDifferenceAmount === 0
                      ? "diff ok"
                      : s.cashDifferenceAmount < 0
                        ? "diff shortage"
                        : "diff overage"
                  }`}
                >
                  {s.cashDifferenceAmount == null
                    ? "—"
                    : formatMoneyFromKopecks(s.cashDifferenceAmount)}
                </td>
                <td>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
