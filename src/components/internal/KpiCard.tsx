"use client";

import type { KpiComparison } from "@/server/services/analytics-formulas";

type Props = {
  label: string;
  value: string;
  comparison?: KpiComparison;
  formula?: string;
  tone?: "default" | "danger" | "warning" | "accent";
  loading?: boolean;
};

function deltaText(comparison?: KpiComparison): string {
  if (!comparison) return "";
  if (comparison.label === "no_baseline") return "Нет данных для сравнения";
  if (comparison.label === "new") return "Новый показатель";
  const sign = comparison.absolute > 0 ? "+" : "";
  const pct =
    comparison.percent === null ? "" : ` (${sign}${comparison.percent.toFixed(1)}%)`;
  return `${sign}${comparison.absolute.toLocaleString("ru-RU")}${pct}`;
}

export function KpiCard({
  label,
  value,
  comparison,
  formula,
  tone = "default",
  loading,
}: Props) {
  if (loading) {
    return <div className="internal-kpi skeleton" aria-busy="true" />;
  }

  const delta = deltaText(comparison);
  const up = comparison && comparison.label === "ok" && comparison.absolute > 0;
  const down = comparison && comparison.label === "ok" && comparison.absolute < 0;

  return (
    <article className={`internal-kpi tone-${tone}`} title={formula}>
      <div className="internal-kpi-label">{label}</div>
      <div className="internal-kpi-value tabular-nums">{value}</div>
      {delta ? (
        <div
          className={`internal-kpi-delta ${up ? "up" : ""} ${down ? "down" : ""} ${
            comparison?.label !== "ok" ? "neutral" : ""
          }`}
        >
          {delta}
        </div>
      ) : null}
      {formula ? <div className="internal-kpi-formula">{formula}</div> : null}
    </article>
  );
}
