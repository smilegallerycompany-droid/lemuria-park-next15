"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError } from "@/lib/api/client";
import { ConfirmDialog } from "@/components/internal";
import { formatMoneyFromKopecks } from "@/lib/utils";
import { useCashierShift } from "./CashierShiftProvider";
import { differenceKind, rublesToKopecks } from "./shift-types";

export function CloseShiftForm() {
  const router = useRouter();
  const { shift, closeShift } = useCashierShift();
  const [closingCash, setClosingCash] = useState(
    shift ? String((shift.expectedCashAmount / 100).toFixed(2)) : "",
  );
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const actual = rublesToKopecks(closingCash);
  const expected = shift?.expectedCashAmount ?? 0;
  const diff = Number.isFinite(actual) ? actual - expected : NaN;
  const kind = Number.isFinite(diff) ? differenceKind(diff) : "ok";

  const liveLabel = useMemo(() => {
    if (!Number.isFinite(diff)) return null;
    if (diff === 0) return { className: "diff ok", text: "Расхождений нет" };
    if (diff < 0) {
      return {
        className: "diff shortage",
        text: `Недостача: ${formatMoneyFromKopecks(Math.abs(diff))}`,
      };
    }
    return { className: "diff overage", text: `Излишек: ${formatMoneyFromKopecks(diff)}` };
  }, [diff]);

  if (!shift) return null;

  async function submit() {
    if (!Number.isFinite(actual)) {
      setError("Укажите фактическую сумму в кассе");
      return;
    }
    if (diff !== 0 && !notes.trim()) {
      setError("При расхождении нужен комментарий");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await closeShift({ closingCashAmount: actual, notes });
      router.replace("/cashier/shift/report");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Не удалось закрыть смену");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <div className="cashier-shift-close cashier-close-wide" data-testid="close-shift-form">
      <h1>Закрытие смены</h1>
      <ul className="cashier-close-ledger">
        <li>
          <span>Наличные на начало</span>
          <b className="tabular-nums">{formatMoneyFromKopecks(shift.openingCashAmount)}</b>
        </li>
        <li>
          <span>+ Продажи наличными</span>
          <b className="tabular-nums">{formatMoneyFromKopecks(shift.cashSalesAmount)}</b>
        </li>
        <li>
          <span>+ Внесения</span>
          <b className="tabular-nums">{formatMoneyFromKopecks(shift.cashIn)}</b>
        </li>
        <li>
          <span>− Возвраты наличными</span>
          <b className="tabular-nums">{formatMoneyFromKopecks(shift.cashRefunds)}</b>
        </li>
        <li>
          <span>− Изъятия</span>
          <b className="tabular-nums">{formatMoneyFromKopecks(shift.cashOut)}</b>
        </li>
        <li className="cashier-close-expected">
          <span>= Ожидается в кассе</span>
          <b className="tabular-nums">{formatMoneyFromKopecks(shift.expectedCashAmount)}</b>
        </li>
      </ul>
      <p className="cashier-close-hero tabular-nums">{formatMoneyFromKopecks(shift.expectedCashAmount)}</p>
      <label>
        Фактически в кассе, ₽
        <input
          value={closingCash}
          onChange={(e) => setClosingCash(e.target.value)}
          inputMode="decimal"
          className="tabular-nums"
        />
      </label>
      {liveLabel ? <p className={liveLabel.className}>{liveLabel.text}</p> : null}
      <label>
        Комментарий{kind !== "ok" ? " (обязателен)" : ""}
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error ? <p className="cashier-error">{error}</p> : null}
      <div className="cashier-actions-row">
        <button
          type="button"
          className="cashier-btn cashier-btn-ghost"
          onClick={() => router.push("/cashier/shift")}
        >
          Назад
        </button>
        <button
          type="button"
          className="cashier-btn cashier-btn-primary"
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          Закрыть смену
        </button>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Закрыть смену?"
        description={
          liveLabel
            ? `${liveLabel.text}. После закрытия продажи будут недоступны, пока не откроете следующую смену.`
            : undefined
        }
        confirmLabel="Закрыть смену"
        danger
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void submit()}
      />
    </div>
  );
}
