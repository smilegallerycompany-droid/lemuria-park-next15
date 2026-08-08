/** Pure analytics formulas — money in kopecks. No DB access. */

export function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function absoluteChange(current: number, previous: number): number {
  return current - previous;
}

export function averageOrderValueKopecks(netRevenue: number, paidOrders: number): number {
  if (paidOrders <= 0) return 0;
  return Math.round(netRevenue / paidOrders);
}

export function averageTicketPriceKopecks(netRevenue: number, ticketsSold: number): number {
  if (ticketsSold <= 0) return 0;
  return Math.round(netRevenue / ticketsSold);
}

/** Returns a 0..1 rate. Multiply by 100 only in UI. */
export function ratePercent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return part / whole;
}

/**
 * Reservation Conversion = paid orders created from reservations /
 * reservations created in the same period (0..1).
 */
export function reservationConversionRate(
  paidOrdersFromReservations: number,
  reservationsCreated: number,
): number {
  return ratePercent(paidOrdersFromReservations, reservationsCreated);
}

export function comparisonWindow(from: Date, to: Date): { from: Date; to: Date } {
  const durationMs = Math.max(0, to.getTime() - from.getTime());
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { from: prevFrom, to: prevTo };
}

export type KpiComparison = {
  current: number;
  previous: number;
  absolute: number;
  percent: number | null;
  label: "ok" | "no_baseline" | "new";
};

export function compareKpi(current: number, previous: number): KpiComparison {
  if (previous === 0 && current === 0) {
    return { current, previous, absolute: 0, percent: 0, label: "no_baseline" };
  }
  if (previous === 0) {
    return { current, previous, absolute: current, percent: null, label: "new" };
  }
  return {
    current,
    previous,
    absolute: absoluteChange(current, previous),
    percent: percentChange(current, previous),
    label: "ok",
  };
}
