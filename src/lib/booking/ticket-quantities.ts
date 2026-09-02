/**
 * Shared ticket-quantity rules for public booking and cashier sale.
 * Behaviour must not depend on ticket type codes (ADULT / CHILD / STAGING_*).
 */

export function emptyTicketQuantities(codes: string[]): Record<string, number> {
  const next: Record<string, number> = {};
  for (const code of codes) next[code] = 0;
  return next;
}

export function selectedTicketCount(quantities: Record<string, number>): number {
  return Object.values(quantities).reduce((sum, n) => sum + Math.max(0, n), 0);
}

export function setTicketQuantity(params: {
  quantities: Record<string, number>;
  code: string;
  next: number;
  remainingSeats: number;
  min?: number;
}): Record<string, number> {
  const min = params.min ?? 0;
  const others = Object.entries(params.quantities)
    .filter(([code]) => code !== params.code)
    .reduce((sum, [, n]) => sum + Math.max(0, n), 0);
  const maxForThis = Math.max(min, params.remainingSeats - others);
  const clamped = Math.min(maxForThis, Math.max(min, Number.isFinite(params.next) ? params.next : min));
  return { ...params.quantities, [params.code]: clamped };
}

export function lineTotalKopecks(
  quantities: Record<string, number>,
  prices: Array<{ code: string; unitPrice: number }>,
): number {
  return prices.reduce((sum, price) => sum + (quantities[price.code] ?? 0) * price.unitPrice, 0);
}

export function canSubmitTicketSelection(
  quantities: Record<string, number>,
  remainingSeats: number,
): boolean {
  const total = selectedTicketCount(quantities);
  return total > 0 && total <= remainingSeats;
}
