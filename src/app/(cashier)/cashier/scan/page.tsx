"use client";

import dynamic from "next/dynamic";
import { LoadingSkeleton } from "@/components/internal";

const QrScanner = dynamic(
  () => import("@/components/cashier/qr-scanner").then((m) => m.QrScanner),
  {
    ssr: false,
    loading: () => <LoadingSkeleton label="Загрузка сканера…" />,
  },
);

export default function CashierScanPage() {
  return <QrScanner />;
}
