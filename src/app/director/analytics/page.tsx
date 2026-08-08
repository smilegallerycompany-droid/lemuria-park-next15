"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/internal";

const AnalyticsDashboard = dynamic(
  () =>
    import("@/components/director/AnalyticsDashboard").then((m) => m.AnalyticsDashboard),
  {
    ssr: false,
    loading: () => <LoadingSkeleton variant="kpi" count={6} label="Загрузка аналитики…" />,
  },
);

export default function DirectorAnalyticsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="kpi" count={6} label="Загрузка аналитики…" />}>
      <AnalyticsDashboard />
    </Suspense>
  );
}
