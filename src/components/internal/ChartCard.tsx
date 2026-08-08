"use client";

import type { ReactNode } from "react";
import { EmptyState } from "@/components/internal/EmptyState";
import { LoadingSkeleton } from "@/components/internal/LoadingSkeleton";

export function ChartCard({
  title,
  children,
  empty,
  loading,
  emptyDescription = "За выбранный период данных нет.",
}: {
  title: string;
  children: ReactNode;
  empty?: boolean;
  loading?: boolean;
  emptyDescription?: string;
}) {
  return (
    <section className="internal-chart-card">
      <h3>{title}</h3>
      {loading ? <LoadingSkeleton /> : null}
      {!loading && empty ? (
        <EmptyState title="Нет данных" description={emptyDescription} />
      ) : null}
      {!loading && !empty ? <div className="internal-chart-body">{children}</div> : null}
    </section>
  );
}
