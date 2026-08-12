"use client";

import Link from "next/link";
import { useCashierShift } from "@/components/cashier/CashierShiftProvider";
import { ShiftReportView } from "@/components/cashier/ShiftReportView";
import { OpenShiftForm } from "@/components/cashier/OpenShiftForm";

export default function CashierShiftReportPage() {
  const { loading, shift, lastClosed } = useCashierShift();

  if (loading) return <div className="cashier-loading">Загрузка…</div>;
  if (shift) {
    return (
      <div className="cashier-panel">
        <p>Смена ещё открыта.</p>
        <Link href="/cashier/shift" className="cashier-btn cashier-btn-primary">
          К смене
        </Link>
      </div>
    );
  }
  if (!lastClosed) return <OpenShiftForm />;
  return <ShiftReportView report={lastClosed} />;
}
