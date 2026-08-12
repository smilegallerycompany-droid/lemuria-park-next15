/** Pure cash math for cashier shifts — amounts in kopecks. */

export type CashLedger = {
  openingCashAmount: number;
  cashSalesAmount: number;
  cashRefundsAmount: number;
  cashInAmount: number;
  cashOutAmount: number;
  /** Audited ADJUSTMENT ops: signed (positive increases drawer). */
  adjustmentsAmount?: number;
};

export function expectedCashKopecks(params: CashLedger): number {
  return (
    params.openingCashAmount +
    params.cashSalesAmount -
    params.cashRefundsAmount +
    params.cashInAmount -
    params.cashOutAmount +
    (params.adjustmentsAmount ?? 0)
  );
}

/** Live drawer balance is the same ledger as expected cash — never a second stored field. */
export function currentCashBalanceKopecks(params: CashLedger): number {
  return expectedCashKopecks(params);
}

export function cashDifferenceKopecks(actual: number, expected: number): number {
  return actual - expected;
}

export function differenceLabel(diff: number): "ok" | "shortage" | "overage" {
  if (diff === 0) return "ok";
  if (diff < 0) return "shortage";
  return "overage";
}

export const SUCCESSFUL_REFUND_STATUSES = ["COMPLETED", "SUCCEEDED"] as const;
