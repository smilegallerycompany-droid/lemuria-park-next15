"use client";

import type { ReactNode } from "react";

export function ChartCard({
  title,
  children,
  empty,
  loading,
}: {
  title: string;
  children: ReactNode;
  empty?: boolean;
  loading?: boolean;
}) {
  return (
    <section className="internal-chart-card">
      <h3>{title}</h3>
      {loading ? <div className="internal-skeleton-block" aria-busy="true" /> : null}
      {!loading && empty ? <div className="internal-empty">Нет данных за период</div> : null}
      {!loading && !empty ? <div className="internal-chart-body">{children}</div> : null}
    </section>
  );
}
