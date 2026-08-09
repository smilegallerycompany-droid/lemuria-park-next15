"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/internal";
import { directorFetch, formatDateTime } from "@/lib/director/client";
import { formatMoneyFromKopecks } from "@/lib/utils";

type ShiftRow = {
  id: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  cashier: { name: string };
  location: { city: string; name: string };
  revenue: number;
  cashSalesAmount: number;
  cardSalesAmount: number;
  cashDifferenceAmount: number | null;
};

export default function DirectorShiftsPage() {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [differenceOnly, setDifferenceOnly] = useState(false);

  useEffect(() => {
    const q = differenceOnly ? "?difference=1" : "";
    directorFetch<{ shifts: ShiftRow[] }>(`/api/director/shifts${q}`)
      .then((d) => setShifts(d.shifts))
      .catch(() => undefined);
  }, [differenceOnly]);

  return (
    <>
      <PageHeader
        title="Смены"
        description="История кассовых смен и расхождения по наличным."
        actions={
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={differenceOnly}
              onChange={(e) => setDifferenceOnly(e.target.checked)}
            />
            Только с расхождением
          </label>
        }
      />
      <div className="director-table-wrap">
        <table className="director-table">
          <thead>
            <tr>
              <th>Открыта</th>
              <th>Кассир</th>
              <th>Локация</th>
              <th>Закрыта</th>
              <th>Выручка</th>
              <th>Наличные</th>
              <th>Карта</th>
              <th>Разница</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/director/shifts/${s.id}`}>{formatDateTime(s.openedAt)}</Link>
                </td>
                <td>{s.cashier.name}</td>
                <td>
                  {s.location.city} — {s.location.name}
                </td>
                <td>{s.closedAt ? formatDateTime(s.closedAt) : "—"}</td>
                <td className="tabular-nums">{formatMoneyFromKopecks(s.revenue)}</td>
                <td className="tabular-nums">{formatMoneyFromKopecks(s.cashSalesAmount)}</td>
                <td className="tabular-nums">{formatMoneyFromKopecks(s.cardSalesAmount)}</td>
                <td
                  className={`tabular-nums ${
                    s.cashDifferenceAmount == null || s.cashDifferenceAmount === 0
                      ? ""
                      : s.cashDifferenceAmount < 0
                        ? "text-danger"
                        : "text-warning"
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
