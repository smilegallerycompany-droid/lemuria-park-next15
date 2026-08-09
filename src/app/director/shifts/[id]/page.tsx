"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/internal";
import { directorFetch, formatDateTime } from "@/lib/director/client";
import { formatMoneyFromKopecks } from "@/lib/utils";

export default function DirectorShiftDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{
    shift: {
      id: string;
      status: string;
      openedAt: string;
      closedAt: string | null;
      openingCashAmount: number;
      closingCashAmount: number | null;
      expectedCashAmount: number | null;
      cashDifferenceAmount: number | null;
      cashSalesAmount: number;
      cardSalesAmount: number;
      onlineSalesAmount: number;
      ordersCount: number;
      ticketsCount: number;
      user: { name: string };
      location: { city: string; name: string };
      cashOperations: Array<{
        id: string;
        type: string;
        amount: number;
        comment: string | null;
        createdAt: string;
      }>;
      orders: Array<{ number: string; totalAmount: number; status: string; createdAt: string }>;
    };
    summary: {
      expectedCashAmount: number;
      cashIn: number;
      cashOut: number;
      cashRefunds: number;
      refundsCount: number;
      checkIns: number;
      durationMinutes: number;
    };
  } | null>(null);

  useEffect(() => {
    directorFetch<NonNullable<typeof data>>(`/api/director/shifts/${params.id}`)
      .then(setData)
      .catch(() => undefined);
  }, [params.id]);

  if (!data) return <div className="director-empty">Загрузка…</div>;
  const { shift, summary } = data;
  const diff = shift.cashDifferenceAmount;

  return (
    <>
      <PageHeader
        title={`Смена · ${shift.user.name}`}
        description={`${shift.location.city} · ${shift.status} · ${summary.durationMinutes} мин`}
        actions={
          <button type="button" className="director-btn secondary" onClick={() => window.print()}>
            Печать отчёта
          </button>
        }
      />

      <div className="director-card-grid">
        <div className="director-kpi">
          <div className="director-kpi-label">Opening</div>
          <div className="director-kpi-value tabular-nums">
            {formatMoneyFromKopecks(shift.openingCashAmount)}
          </div>
        </div>
        <div className="director-kpi">
          <div className="director-kpi-label">Expected</div>
          <div className="director-kpi-value tabular-nums">
            {formatMoneyFromKopecks(summary.expectedCashAmount)}
          </div>
        </div>
        <div className="director-kpi">
          <div className="director-kpi-label">Actual</div>
          <div className="director-kpi-value tabular-nums">
            {shift.closingCashAmount != null
              ? formatMoneyFromKopecks(shift.closingCashAmount)
              : "—"}
          </div>
        </div>
        <div className={`director-kpi ${diff && diff < 0 ? "tone-danger" : diff && diff > 0 ? "tone-warning" : ""}`}>
          <div className="director-kpi-label">Difference</div>
          <div className="director-kpi-value tabular-nums">
            {diff == null ? "—" : formatMoneyFromKopecks(diff)}
          </div>
        </div>
      </div>

      <section className="director-panel" style={{ marginTop: 18 }}>
        <div className="director-panel-head">
          <h2>Summary</h2>
        </div>
        <ul className="director-plain-list">
          <li>
            <span>Открыта</span>
            <strong>{formatDateTime(shift.openedAt)}</strong>
          </li>
          <li>
            <span>Закрыта</span>
            <strong>{shift.closedAt ? formatDateTime(shift.closedAt) : "—"}</strong>
          </li>
          <li>
            <span>Cash / Card / Online</span>
            <strong>
              {formatMoneyFromKopecks(shift.cashSalesAmount)} /{" "}
              {formatMoneyFromKopecks(shift.cardSalesAmount)} /{" "}
              {formatMoneyFromKopecks(shift.onlineSalesAmount)}
            </strong>
          </li>
          <li>
            <span>IN / OUT</span>
            <strong>
              {formatMoneyFromKopecks(summary.cashIn)} / {formatMoneyFromKopecks(summary.cashOut)}
            </strong>
          </li>
          <li>
            <span>Orders / Tickets / Check-ins / Refunds</span>
            <strong>
              {shift.ordersCount} / {shift.ticketsCount} / {summary.checkIns} /{" "}
              {summary.refundsCount}
            </strong>
          </li>
        </ul>
      </section>

      <section className="director-panel" style={{ marginTop: 18 }}>
        <div className="director-panel-head">
          <h2>Cash operations</h2>
        </div>
        <div className="director-table-wrap">
          <table className="director-table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Тип</th>
                <th>Сумма</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {shift.cashOperations.map((op) => (
                <tr key={op.id}>
                  <td>{formatDateTime(op.createdAt)}</td>
                  <td>{op.type}</td>
                  <td className="tabular-nums">{formatMoneyFromKopecks(op.amount)}</td>
                  <td>{op.comment ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="director-panel" style={{ marginTop: 18 }}>
        <div className="director-panel-head">
          <h2>Orders</h2>
        </div>
        <div className="director-table-wrap">
          <table className="director-table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Время</th>
              </tr>
            </thead>
            <tbody>
              {shift.orders.map((o) => (
                <tr key={o.number}>
                  <td>
                    <a href={`/director/orders/${o.number}`}>{o.number}</a>
                  </td>
                  <td className="tabular-nums">{formatMoneyFromKopecks(o.totalAmount)}</td>
                  <td>{o.status}</td>
                  <td>{formatDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
