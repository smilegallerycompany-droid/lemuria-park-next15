"use client";

import type { KpiComparison } from "@/server/services/analytics-formulas";

type Props = {
  label: string;
  value: string;
  comparison?: KpiComparison;
  formula?: string;
  tone?: "default" | "danger" | "warning" | "accent";
  loading?: boolean;
  /** How to render absolute delta. Default: plain number. */
  deltaKind?: "number" | "money" | "percent";
};

function formatAbsolute(value: number, kind: Props["deltaKind"]): string {
  if (kind === "money") {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }).format(value / 100);
  }
  if (kind === "percent") {
    return `${(value * 100).toFixed(1)} п.п.`;
  }
  return value.toLocaleString("ru-RU");
}

function deltaText(comparison: KpiComparison | undefined, kind: Props["deltaKind"]): string {
  if (!comparison) return "";
  if (comparison.label === "no_baseline") return "Нет данных для сравнения";
  if (comparison.label === "new") return "Новый показатель";
  const sign = comparison.absolute > 0 ? "+" : "";
  const abs = formatAbsolute(comparison.absolute, kind);
  const pct =
    comparison.percent === null ? "" : ` (${sign}${comparison.percent.toFixed(1)}%)`;
  return `${sign}${abs}${pct}`;
}

export function KpiCard({
  label,
  value,
  comparison,
  formula,
  tone = "default",
  loading,
  deltaKind = "number",
}: Props) {
  if (loading) {
    return <div className="internal-kpi skeleton" aria-busy="true" />;
  }

  const delta = deltaText(comparison, deltaKind);
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
