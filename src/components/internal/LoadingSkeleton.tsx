type Props = {
  variant?: "block" | "kpi" | "rows";
  count?: number;
  label?: string;
};

export function LoadingSkeleton({
  variant = "block",
  count = 1,
  label = "Загрузка…",
}: Props) {
  if (variant === "kpi") {
    return (
      <div className="internal-kpi-grid" aria-busy="true" aria-label={label}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="internal-kpi skeleton" />
        ))}
      </div>
    );
  }

  if (variant === "rows") {
    return (
      <div aria-busy="true" aria-label={label}>
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className="internal-skeleton-block"
            style={{ height: 48, marginBottom: 8 }}
          />
        ))}
      </div>
    );
  }

  return <div className="internal-skeleton-block" aria-busy="true" aria-label={label} />;
}
