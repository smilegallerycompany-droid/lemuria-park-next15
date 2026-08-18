"use client";

import { formatMoneyFromKopecks } from "@/lib/utils";
import { cashOpLabel, formatShiftTime, type ShiftOperation } from "./shift-types";

export function CashJournal({ operations }: { operations: ShiftOperation[] }) {
  if (operations.length === 0) {
    return <div className="cashier-empty">Операций пока нет</div>;
  }

  return (
    <div className="cashier-journal-wrap" data-testid="cash-journal">
      <table className="cashier-journal-table">
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
          {operations.map((op) => (
            <tr key={op.id} className={`cash-op-${op.type.toLowerCase()}`}>
              <td>{formatShiftTime(op.createdAt)}</td>
              <td>{cashOpLabel(op.type)}</td>
              <td className="tabular-nums cashier-journal-amount">{formatMoneyFromKopecks(op.amount)}</td>
              <td>{op.comment || "—"}</td>
              <td>{op.orderNumber || "—"}</td>
              <td>{op.userName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
