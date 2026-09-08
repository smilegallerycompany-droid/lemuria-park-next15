"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmDialog, PageHeader } from "@/components/internal";
import { directorFetch, formatDateTime } from "@/lib/director/client";
import { labelCashOp, labelStatus } from "@/lib/director/labels";
import { useStaffBasePath } from "@/lib/staff-portal";
import { formatMoneyFromKopecks } from "@/lib/utils";

export default function DirectorShiftDetailPage() {
  const params = useParams<{ id: string }>();
  const base = useStaffBasePath();
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
      notes: string | null;
      closeReason: string | null;
      user: { name: string };
      location: { city: string; name: string };
      cashOperations: Array<{
        id: string;
        type: string;
        amount: number;
        comment: string | null;
        createdAt: string;
        user?: { name: string };
        order?: { number: string } | null;
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
  const [forceReason, setForceReason] = useState("");
  const [forceCash, setForceCash] = useState("");
  const [forceForm, setForceForm] = useState(false);
  const [forceConfirm, setForceConfirm] = useState(false);
  const [forceBusy, setForceBusy] = useState(false);
  const [forceError, setForceError] = useState<string | null>(null);

  function reload() {
    directorFetch<NonNullable<typeof data>>(`/api/director/shifts/${params.id}`)
      .then((payload) => {
        setData(payload);
        setForceCash(String((payload.summary.expectedCashAmount / 100).toFixed(2)));
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (!data) return <div className="director-empty">Загрузка…</div>;
  const { shift, summary } = data;
  const diff = shift.cashDifferenceAmount;
  const kind = diff == null || diff === 0 ? "ok" : diff < 0 ? "shortage" : "overage";

  async function forceClose() {
    if (!forceReason.trim()) {
      setForceError("Укажите причину");
      return;
    }
    const rub = Number(forceCash.replace(",", "."));
    const kopecks = Math.round((Number.isFinite(rub) ? rub : 0) * 100);
    setForceBusy(true);
    setForceError(null);
    try {
      await directorFetch("/api/director/shifts", {
        method: "POST",
        body: JSON.stringify({
          shiftId: shift.id,
          closingCashAmount: kopecks,
          reason: forceReason.trim(),
        }),
      });
      setForceConfirm(false);
      setForceForm(false);
      reload();
    } catch (err) {
      setForceError(err instanceof Error ? err.message : "Не удалось закрыть");
    } finally {
      setForceBusy(false);
    }
  }

  return (
    <div className="shift-print-root">
      <div className="shift-print-letterhead">
        <p>Лемурия Парк</p>
        <h1>Отчёт по смене</h1>
        <p>
          {shift.user.name} · {shift.location.city} — {shift.location.name}
        </p>
        <p>Дата: {formatDateTime(shift.openedAt)}</p>
      </div>
      <PageHeader
        title={`Смена · ${shift.user.name}`}
        description={`${shift.location.city} · ${labelStatus(shift.status)} · ${summary.durationMinutes} мин`}
        actions={
          <div className="no-print" style={{ display: "flex", gap: 8 }}>
            {shift.status === "OPEN" ? (
              <button type="button" className="director-btn danger" onClick={() => setForceForm(true)}>
                Принудительно закрыть
              </button>
            ) : null}
            <button type="button" className="director-btn secondary" onClick={() => window.print()}>
              Печать отчёта
            </button>
          </div>
        }
      />

      {diff != null && diff !== 0 ? (
        <div className={`director-alert ${kind === "shortage" ? "error" : ""}`} data-testid="shift-diff-banner">
          {kind === "shortage" ? "Недостача" : "Излишек"}: {formatMoneyFromKopecks(Math.abs(diff))}
        </div>
      ) : null}

      <div className="director-card-grid">
        <div className="director-kpi">
          <div className="director-kpi-label">На открытии</div>
          <div className="director-kpi-value tabular-nums">
            {formatMoneyFromKopecks(shift.openingCashAmount)}
          </div>
        </div>
        <div className="director-kpi">
          <div className="director-kpi-label">Ожидается</div>
          <div className="director-kpi-value tabular-nums">
            {formatMoneyFromKopecks(summary.expectedCashAmount)}
          </div>
        </div>
        <div className="director-kpi">
          <div className="director-kpi-label">Факт</div>
          <div className="director-kpi-value tabular-nums">
            {shift.closingCashAmount != null
              ? formatMoneyFromKopecks(shift.closingCashAmount)
              : "—"}
          </div>
        </div>
        <div className={`director-kpi ${diff && diff < 0 ? "tone-danger" : diff && diff > 0 ? "tone-warning" : ""}`}>
          <div className="director-kpi-label">Расхождение</div>
          <div className={`director-kpi-value tabular-nums diff ${kind}`}>
            {diff == null ? "—" : formatMoneyFromKopecks(diff)}
          </div>
        </div>
      </div>

      <section className="director-panel" style={{ marginTop: 18 }}>
        <div className="director-panel-head">
          <h2>Итог смены</h2>
        </div>
        <ul className="director-kv-list">
          <li>
            <span>Открыта</span>
            <strong>{formatDateTime(shift.openedAt)}</strong>
          </li>
          <li>
            <span>Закрыта</span>
            <strong>{shift.closedAt ? formatDateTime(shift.closedAt) : "—"}</strong>
          </li>
          <li>
            <span>Наличные / карта / онлайн</span>
            <strong>
              {formatMoneyFromKopecks(shift.cashSalesAmount)} /{" "}
              {formatMoneyFromKopecks(shift.cardSalesAmount)} /{" "}
              {formatMoneyFromKopecks(shift.onlineSalesAmount)}
            </strong>
          </li>
          <li>
            <span>Внесения / изъятия</span>
            <strong>
              {formatMoneyFromKopecks(summary.cashIn)} / {formatMoneyFromKopecks(summary.cashOut)}
            </strong>
          </li>
          <li>
            <span>Заказы / билеты / проходы / возвраты</span>
            <strong>
              {shift.ordersCount} / {shift.ticketsCount} / {summary.checkIns} /{" "}
              {summary.refundsCount}
            </strong>
          </li>
          {shift.notes ? (
            <li>
              <span>Комментарий</span>
              <strong>{shift.notes}</strong>
            </li>
          ) : null}
          {shift.closeReason ? (
            <li>
              <span>Причина принудительного закрытия</span>
              <strong>{shift.closeReason}</strong>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="director-panel" style={{ marginTop: 18 }}>
        <div className="director-panel-head">
          <h2>Операции с наличными</h2>
        </div>
        <div className="director-table-wrap">
          <table className="director-table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Тип</th>
                <th>Сумма</th>
                <th>Комментарий</th>
                <th>Заказ</th>
                <th>Сотрудник</th>
              </tr>
            </thead>
            <tbody>
              {shift.cashOperations.map((op) => (
                <tr key={op.id} className={`cash-op-${op.type.toLowerCase()}`}>
                  <td>{formatDateTime(op.createdAt)}</td>
                  <td>{labelCashOp(op.type)}</td>
                  <td className="tabular-nums">{formatMoneyFromKopecks(op.amount)}</td>
                  <td>{op.comment ?? "—"}</td>
                  <td>{op.order?.number ?? "—"}</td>
                  <td>{op.user?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="director-panel" style={{ marginTop: 18 }}>
        <div className="director-panel-head">
          <h2>Заказы</h2>
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
                    <a href={`${base}/orders/${o.number}`}>{o.number}</a>
                  </td>
                  <td className="tabular-nums">{formatMoneyFromKopecks(o.totalAmount)}</td>
                  <td>{labelStatus(o.status)}</td>
                  <td>{formatDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="shift-print-footer">
        Сформировано {new Date().toLocaleString("ru-RU")} · расхождение{" "}
        {diff == null ? "—" : formatMoneyFromKopecks(diff)}
        {shift.notes ? ` · ${shift.notes}` : ""}
      </p>

      {forceForm ? (
        <div className="director-panel no-print" style={{ marginTop: 12 }} data-testid="force-close-form">
          <p>
            Принудительное закрытие. Смена получит статус «Принудительно закрыта». Причина обязательна.
          </p>
          <label>
            Фактически в кассе, ₽
            <input
              value={forceCash}
              onChange={(e) => setForceCash(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label>
            Причина (обязательно)
            <input value={forceReason} onChange={(e) => setForceReason(e.target.value)} />
          </label>
          {forceError ? <p className="cashier-error">{forceError}</p> : null}
          <div className="cashier-actions-row">
            <button type="button" className="director-btn secondary" onClick={() => setForceForm(false)}>
              Отмена
            </button>
            <button
              type="button"
              className="director-btn danger"
              onClick={() => {
                if (!forceReason.trim()) {
                  setForceError("Укажите причину");
                  return;
                }
                setForceConfirm(true);
              }}
            >
              Закрыть принудительно
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={forceConfirm}
        title="Принудительно закрыть смену?"
        description="Смена будет принудительно закрыта. Действие записывается в журнал аудита."
        confirmLabel="Закрыть"
        danger
        busy={forceBusy}
        onCancel={() => setForceConfirm(false)}
        onConfirm={() => void forceClose()}
      />
    </div>
  );
}
