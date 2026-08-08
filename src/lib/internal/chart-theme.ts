export const CHART_COLORS = {
  primary: "#1f6b45",
  secondary: "#3d8f62",
  accent: "#d97706",
  neutral: "#8a9289",
  danger: "#b42318",
} as const;

export function formatRubFromKopecks(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value / 100);
}
