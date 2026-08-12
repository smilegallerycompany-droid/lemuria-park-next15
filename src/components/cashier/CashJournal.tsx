"use client";

import { formatMoneyFromKopecks } from "@/lib/utils";
import { cashOpLabel, formatShiftTime, type ShiftOperation } from "./shift-types";

export function CashJournal({ operations }: { operations: ShiftOperation[] }) {
  if (operations.length === 0) {
    return <div className="cashier-empty">Операций пока нет</div>;
  }

  return (
    <div className="cashier-journal" data-testid="cash-journal">
      {operations.map((op) => (
        <article key={op.id} className={`cashier-journal-row cash-op-${op.type.toLowerCase()}`}>
          <div>
            <strong>{cashOpLabel(op.type)}</strong>
            <span>{formatShiftTime(op.createdAt)}</span>
          </div>
          <div className="tabular-nums cashier-journal-amount">{formatMoneyFromKopecks(op.amount)}</div>
          <p>{op.comment || "—"}</p>
          <p className="cashier-journal-meta">
            {op.userName}
            {op.orderNumber ? ` · ${op.orderNumber}` : ""}
          </p>
        </article>
      ))}
    </div>
  );
}
