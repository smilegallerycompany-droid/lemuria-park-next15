"use client";

import { Suspense } from "react";
import { AnalyticsDashboard } from "@/components/director/AnalyticsDashboard";

export default function DirectorAnalyticsPage() {
  return (
    <Suspense fallback={<div className="director-empty">Загрузка аналитики…</div>}>
      <AnalyticsDashboard />
    </Suspense>
  );
}
