"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCashierShift } from "@/components/cashier/CashierShiftProvider";
import { CloseShiftForm } from "@/components/cashier/CloseShiftForm";
import { OpenShiftForm } from "@/components/cashier/OpenShiftForm";

export default function CashierCloseShiftPage() {
  const { loading, shift, lastClosed } = useCashierShift();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !shift && lastClosed) {
      router.replace("/cashier/shift/report");
    }
  }, [loading, shift, lastClosed, router]);

  if (loading) return <div className="cashier-loading">Загрузка…</div>;
  if (!shift) return <OpenShiftForm />;
  return <CloseShiftForm />;
}
