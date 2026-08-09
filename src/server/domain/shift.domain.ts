/** Pure cash math for cashier shifts — amounts in kopecks. */

export function expectedCashKopecks(params: {
  openingCashAmount: number;
  cashSalesAmount: number;
  cashRefundsAmount: number;
  cashInAmount: number;
  cashOutAmount: number;
}): number {
  return (
    params.openingCashAmount +
    params.cashSalesAmount -
    params.cashRefundsAmount +
    params.cashInAmount -
    params.cashOutAmount
  );
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
