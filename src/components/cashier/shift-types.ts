export type CashOpType =
  | "OPENING"
  | "SALE"
  | "REFUND"
  | "IN"
  | "OUT"
  | "CLOSING"
  | "ADJUSTMENT";

export type ShiftOperation = {
  id: string;
  type: CashOpType | string;
  amount: number;
  comment: string | null;
  createdAt: string;
  orderId: string | null;
  orderNumber: string | null;
  userName: string;
};

export type ShiftDto = {
  id: string;
  publicId: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  openingCashAmount: number;
  closingCashAmount: number | null;
  cashSalesAmount: number;
  cardSalesAmount: number;
  onlineSalesAmount: number;
  ordersCount: number;
  ticketsCount: number;
  notes: string | null;
  closeReason: string | null;
  location: { id: string; name: string; city: string };
  user: { id?: string; name: string; email?: string };
  expectedCashAmount: number;
  currentCashBalance: number;
  salesTotal: number;
  cashIn: number;
  cashOut: number;
  cashRefunds: number;
  adjustmentsAmount: number;
  cashDifferenceAmount: number | null;
  refundsCount: number;
  operations: ShiftOperation[];
};

export type ShiftPayload = {
  shift: ShiftDto | null;
  lastClosed: ShiftDto | null;
};

export type LocationRow = { id: string; name: string; city: string };

export function rublesToKopecks(raw: string): number {
  const rub = Number(raw.replace(",", ".").replace(/\s/g, ""));
  if (!Number.isFinite(rub) || rub < 0) return NaN;
  return Math.round(rub * 100);
}

export function formatShiftTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function formatShiftDateTime(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function cashOpLabel(type: string) {
  switch (type) {
    case "OPENING":
      return "Открытие";
    case "SALE":
      return "Продажа";
    case "REFUND":
      return "Возврат";
    case "IN":
      return "Внесение";
    case "OUT":
      return "Изъятие";
    case "CLOSING":
      return "Закрытие";
    case "ADJUSTMENT":
      return "Корректировка";
    default:
      return type;
  }
}

export function differenceKind(diff: number): "ok" | "shortage" | "overage" {
  if (diff === 0) return "ok";
  if (diff < 0) return "shortage";
  return "overage";
}
