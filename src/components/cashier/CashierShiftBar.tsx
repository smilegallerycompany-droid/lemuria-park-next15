"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatMoneyFromKopecks } from "@/lib/utils";
import { useCashierShift } from "./CashierShiftProvider";
import { formatShiftTime } from "./shift-types";

export function CashierShiftBar() {
  const { loading, shift, toast, error } = useCashierShift();
  const pathname = usePathname();
  if (pathname === "/cashier/login") return null;
  if (loading && !shift) return null;

  if (!shift) {
    return (
      <div className="cashier-shift-strip cashier-shift-strip-idle">
        <div>
          <strong>Смена не открыта</strong>
          <span>Продажи недоступны, пока смена закрыта</span>
        </div>
        <Link href="/cashier" className="cashier-btn cashier-btn-primary cashier-shift-strip-btn">
          Открыть смену
        </Link>
      </div>
    );
  }

  const opened = formatShiftTime(shift.openedAt);
  const sales = shift.salesTotal;

  return (
    <>
      <div className="cashier-shift-strip" data-testid="cashier-shift-bar">
        <div className="cashier-shift-strip-main">
          <strong>Смена открыта</strong>
          <span>
            Открыта {opened} · {shift.user.name} · {shift.location.city}
          </span>
        </div>
        <div className="cashier-shift-strip-metrics">
          <div>
            <span>Наличные</span>
            <b className="tabular-nums">{formatMoneyFromKopecks(shift.currentCashBalance)}</b>
          </div>
          <div>
            <span>Продажи</span>
            <b className="tabular-nums">{formatMoneyFromKopecks(sales)}</b>
          </div>
          <div>
            <span>Заказов</span>
            <b className="tabular-nums">{shift.ordersCount}</b>
          </div>
        </div>
        <Link href="/cashier/shift" className="cashier-btn cashier-btn-ghost cashier-shift-strip-btn">
          Смена
        </Link>
      </div>
      {toast ? (
        <div className="cashier-toast" role="status">
          {toast}
        </div>
      ) : null}
      {error ? <div className="cashier-error">{error}</div> : null}
    </>
  );
}
