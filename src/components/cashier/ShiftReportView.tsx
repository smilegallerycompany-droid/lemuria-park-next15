"use client";

import Link from "next/link";
import { formatMoneyFromKopecks } from "@/lib/utils";
import { differenceKind, formatShiftDateTime, type ShiftDto } from "./shift-types";

export function ShiftReportView({
  report,
  showActions = true,
}: {
  report: ShiftDto;
  showActions?: boolean;
}) {
  const diff = report.cashDifferenceAmount ?? 0;
  const kind = differenceKind(diff);
  const durationMin =
    report.closedAt != null
      ? Math.round((new Date(report.closedAt).getTime() - new Date(report.openedAt).getTime()) / 60000)
      : null;

  return (
    <div className="cashier-shift-report shift-print-root" data-testid="shift-report">
      <div className="shift-print-letterhead">
        <p>Лемурия Парк</p>
        <h1>Отчёт по смене</h1>
      </div>
      <h1 className="no-print">Смена закрыта</h1>
      <dl className="cashier-report-dl">
        <div>
          <dt>Кассир</dt>
          <dd>{report.user.name}</dd>
        </div>
        <div>
          <dt>Локация</dt>
          <dd>
            {report.location.city} — {report.location.name}
          </dd>
        </div>
        <div>
          <dt>Открыта</dt>
          <dd>{formatShiftDateTime(report.openedAt)}</dd>
        </div>
        <div>
          <dt>Закрыта</dt>
          <dd>{report.closedAt ? formatShiftDateTime(report.closedAt) : "—"}</dd>
        </div>
        {durationMin != null ? (
          <div>
            <dt>Длительность</dt>
            <dd>{durationMin} мин</dd>
          </div>
        ) : null}
        <div>
          <dt>Продажи</dt>
          <dd className="tabular-nums">{formatMoneyFromKopecks(report.salesTotal)}</dd>
        </div>
        <div>
          <dt>Наличные продажи</dt>
          <dd className="tabular-nums">{formatMoneyFromKopecks(report.cashSalesAmount)}</dd>
        </div>
        <div>
          <dt>Карта</dt>
          <dd className="tabular-nums">{formatMoneyFromKopecks(report.cardSalesAmount)}</dd>
        </div>
        <div>
          <dt>Онлайн</dt>
          <dd className="tabular-nums">{formatMoneyFromKopecks(report.onlineSalesAmount)}</dd>
        </div>
        <div>
          <dt>Возвраты (cash)</dt>
          <dd className="tabular-nums">{formatMoneyFromKopecks(report.cashRefunds)}</dd>
        </div>
        <div>
          <dt>Билеты / заказы</dt>
          <dd>
            {report.ticketsCount} / {report.ordersCount}
          </dd>
        </div>
        <div>
          <dt>Ожидаемые наличные</dt>
          <dd className="tabular-nums">{formatMoneyFromKopecks(report.expectedCashAmount)}</dd>
        </div>
        <div>
          <dt>Фактические наличные</dt>
          <dd className="tabular-nums">
            {report.closingCashAmount != null
              ? formatMoneyFromKopecks(report.closingCashAmount)
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Расхождение</dt>
          <dd className={`tabular-nums diff ${kind}`}>
            {formatMoneyFromKopecks(diff)}
            {kind === "ok" ? " · нет" : kind === "shortage" ? " · недостача" : " · излишек"}
          </dd>
        </div>
        {report.notes ? (
          <div>
            <dt>Комментарий</dt>
            <dd>{report.notes}</dd>
          </div>
        ) : null}
        {report.closeReason ? (
          <div>
            <dt>Причина force-close</dt>
            <dd>{report.closeReason}</dd>
          </div>
        ) : null}
      </dl>
      <p className="shift-print-footer">
        Сформировано {new Date().toLocaleString("ru-RU")} · {report.publicId}
      </p>
      {showActions ? (
        <div className="cashier-actions-row no-print">
          <button type="button" className="cashier-btn cashier-btn-primary" onClick={() => window.print()}>
            Распечатать отчёт
          </button>
          <Link href="/cashier" className="cashier-btn cashier-btn-ghost">
            Вернуться к кассе
          </Link>
        </div>
      ) : null}
    </div>
  );
}
