"use client";

import Link from "next/link";
import { useCashierShift } from "@/components/cashier/CashierShiftProvider";
import { OpenShiftForm } from "@/components/cashier/OpenShiftForm";
import { CashJournal } from "@/components/cashier/CashJournal";
import { formatMoneyFromKopecks } from "@/lib/utils";

export default function CashierShiftPage() {
  const { loading, shift, setSheet } = useCashierShift();

  if (loading) return <div className="cashier-loading">Загрузка смены…</div>;
  if (!shift) return <OpenShiftForm />;

  return (
    <div className="cashier-shift-page">
      <h1 className="cashier-page-title">Смена</h1>
      <p className="cashier-page-sub">
        {shift.location.city} · {shift.user.name} · наличные{" "}
        <span className="tabular-nums">{formatMoneyFromKopecks(shift.currentCashBalance)}</span>
      </p>
      <div className="cashier-quick-actions">
        <button type="button" className="cashier-btn cashier-btn-primary" onClick={() => setSheet("in")}>
          Внести наличные
        </button>
        <button type="button" className="cashier-btn cashier-btn-ghost" onClick={() => setSheet("out")}>
          Изъять наличные
        </button>
        <Link href="/cashier/shift/close" className="cashier-btn cashier-btn-orange">
          Закрыть смену
        </Link>
      </div>
      <section className="cashier-panel" style={{ marginTop: 16 }}>
        <h2 className="cashier-section-title">Последние операции</h2>
        <CashJournal operations={shift.operations} />
      </section>
    </div>
  );
}
