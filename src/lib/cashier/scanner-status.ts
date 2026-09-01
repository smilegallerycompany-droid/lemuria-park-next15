export type ScanResultCode =
  | "SUCCESS"
  | "ALREADY_USED"
  | "INVALID"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED"
  | "WRONG_DATE"
  | "WRONG_LOCATION";

export type ScanTone = "valid" | "used" | "refunded" | "bad";

export function scannerStatusTone(result: ScanResultCode): ScanTone {
  if (result === "SUCCESS") return "valid";
  if (result === "ALREADY_USED" || result === "EXPIRED" || result === "WRONG_DATE") return "used";
  if (result === "REFUNDED") return "refunded";
  return "bad";
}

export function scannerStatusTitle(result: ScanResultCode): string {
  switch (result) {
    case "SUCCESS":
      return "Вход разрешён";
    case "ALREADY_USED":
      return "Билет уже использован";
    case "REFUNDED":
      return "Билет возвращён";
    case "CANCELLED":
      return "Билет отменён";
    case "EXPIRED":
    case "WRONG_DATE":
      return "Билет на другую дату";
    case "WRONG_LOCATION":
      return "Другая локация";
    case "INVALID":
      return "Билет не найден";
    default:
      return "Проверка не пройдена";
  }
}
