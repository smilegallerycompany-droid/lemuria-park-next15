"use client";

import { useState } from "react";
import { ApiClientError } from "@/lib/api/client";
import { ConfirmDialog } from "@/components/internal";
import { formatMoneyFromKopecks } from "@/lib/utils";
import { useCashierShift } from "./CashierShiftProvider";
import { rublesToKopecks } from "./shift-types";

const IN_HINTS = ["Размен", "Внесение администратора", "Другое"];
const OUT_HINTS = ["Инкассация", "Размен в банк", "Другое"];

export function CashOperationSheet() {
  const { sheet, setSheet, shift, cashMove } = useCashierShift();
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);

  if (!sheet || !shift) return null;

  const currentShift = shift;
  const isIn = sheet === "in";
  const kopecks = rublesToKopecks(amount);
  const afterOut =
    Number.isFinite(kopecks) ? currentShift.currentCashBalance - kopecks : currentShift.currentCashBalance;
  const hints = isIn ? IN_HINTS : OUT_HINTS;

  function reset() {
    setAmount("");
    setComment("");
    setError(null);
    setConfirmOut(false);
    setSheet(null);
  }

  async function submit() {
    if (!Number.isFinite(kopecks) || kopecks <= 0) {
      setError("Укажите сумму больше 0");
      return;
    }
    if (!comment.trim()) {
      setError("Комментарий обязателен");
      return;
    }
    if (!isIn && kopecks > currentShift.currentCashBalance) {
      setError("INSUFFICIENT_CASH_BALANCE: нельзя изъять больше, чем в кассе");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await cashMove(isIn ? "IN" : "OUT", kopecks, comment.trim());
      setAmount("");
      setComment("");
      setConfirmOut(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Операция не выполнена");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cashier-sheet-backdrop" role="presentation">
      <button type="button" className="cashier-sheet-scrim" aria-label="Закрыть" onClick={reset} />
      <div className="cashier-sheet" role="dialog" aria-modal="true" aria-labelledby="cash-op-title">
        <h2 id="cash-op-title">{isIn ? "Внести наличные" : "Изъять наличные"}</h2>
        {!isIn ? (
          <p className="cashier-sheet-preview">
            Сейчас в кассе:{" "}
            <b className="tabular-nums">{formatMoneyFromKopecks(currentShift.currentCashBalance)}</b>
            {Number.isFinite(kopecks) && kopecks > 0 ? (
              <>
                <br />
                После операции:{" "}
                <b className="tabular-nums">{formatMoneyFromKopecks(Math.max(0, afterOut))}</b>
              </>
            ) : null}
          </p>
        ) : null}
        <label>
          Сумма, ₽
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label>
          Комментарий
          <input value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        <div className="cashier-hint-row">
          {hints.map((hint) => (
            <button
              key={hint}
              type="button"
              className="cashier-filter-btn"
              onClick={() => setComment(hint)}
            >
              {hint}
            </button>
          ))}
        </div>
        {error ? <p className="cashier-error">{error}</p> : null}
        <div className="cashier-actions-row">
          <button type="button" className="cashier-btn cashier-btn-ghost" onClick={reset} disabled={busy}>
            Отмена
          </button>
          <button
            type="button"
            className="cashier-btn cashier-btn-primary"
            disabled={busy}
            onClick={() => {
              if (!isIn) {
                setConfirmOut(true);
                return;
              }
              void submit();
            }}
          >
            {busy ? "…" : isIn ? "Внести" : "Изъять"}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOut}
        title="Изъять наличные?"
        description={
          Number.isFinite(kopecks)
            ? `Из кассы будет изъято ${formatMoneyFromKopecks(kopecks)}. После операции: ${formatMoneyFromKopecks(Math.max(0, afterOut))}.`
            : undefined
        }
        confirmLabel="Изъять"
        danger
        busy={busy}
        onCancel={() => setConfirmOut(false)}
        onConfirm={() => void submit()}
      />
    </div>
  );
}
