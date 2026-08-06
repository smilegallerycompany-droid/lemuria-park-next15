/** Russian display labels for director UI enums (API values stay English). */

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  CASHIER: "Кассир",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Активен",
  DISABLED: "Отключён",
  UPCOMING: "Скоро",
  PAUSED: "Пауза",
  CLOSED: "Закрыт",
  SCHEDULED: "Запланирован",
  OPEN: "Открыт",
  CANCELLED: "Отменён",
  PAID: "Оплачен",
  AWAITING_PAYMENT: "Ожидает оплаты",
  REFUNDED: "Возврат",
  PARTIALLY_REFUNDED: "Частичный возврат",
  EXPIRED: "Истёк",
  VALID: "Действителен",
  USED: "Использован",
  VOID: "Аннулирован",
  SUCCEEDED: "Успешно",
  FAILED: "Ошибка",
  PENDING: "В обработке",
};

const SOURCE_LABELS: Record<string, string> = {
  ONLINE: "Онлайн",
  CASHIER: "Касса",
};

const DAY_TYPE_LABELS: Record<string, string> = {
  WEEKDAY: "Будни",
  WEEKEND: "Выходные",
};

export function labelRole(value: string): string {
  return ROLE_LABELS[value] ?? value;
}

export function labelStatus(value: string): string {
  return STATUS_LABELS[value] ?? value;
}

export function labelSource(value: string): string {
  return SOURCE_LABELS[value] ?? value;
}

export function labelDayType(value: string): string {
  return DAY_TYPE_LABELS[value] ?? value;
}

export function labelActive(isActive: boolean): string {
  return isActive ? "Активно" : "Выкл";
}
