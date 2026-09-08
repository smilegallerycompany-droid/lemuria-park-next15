/** Russian display labels for director UI enums (API values stay English). */

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  DIRECTOR: "Директор",
  CASHIER: "Кассир",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Активен",
  DISABLED: "Отключён",
  UPCOMING: "Скоро",
  PAUSED: "Пауза",
  CLOSED: "Закрыт",
  SCHEDULED: "Запланирован",
  OPEN: "Открыта",
  COMPLETED: "Завершён",
  FORCE_CLOSED: "Принудительно закрыта",
  OK: "В норме",
  WARNING: "Внимание",
  ERROR: "Ошибка",
  NOT_CONFIGURED: "Не настроено",
  UNKNOWN: "Неизвестно",
  LOCAL_DEV: "Локально",
  INVITED: "Приглашён",
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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Наличные",
  CARD_TERMINAL: "Карта",
  CARD_ONLINE: "Сайт",
  YOOKASSA: "ЮKassa",
  CARD: "Карта",
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

export function labelPaymentMethod(value: string): string {
  return PAYMENT_METHOD_LABELS[value] ?? value;
}

const CASH_OP_LABELS: Record<string, string> = {
  IN: "Внесение",
  OUT: "Изъятие",
  SALE: "Продажа",
};

export function labelCashOp(value: string): string {
  return CASH_OP_LABELS[value] ?? value;
}

export function labelActive(isActive: boolean): string {
  return isActive ? "Активно" : "Выключено";
}

const TIMELINE_TYPE_LABELS: Record<string, string> = {
  RESERVATION_CREATED: "Бронь",
  ORDER_CREATED: "Заказ",
  PAYMENT_CREATED: "Платёж",
  PAYMENT_SUCCEEDED: "Оплата",
  PAYMENT_CANCELLED: "Платёж отменён",
  TICKETS_ISSUED: "Билеты",
  EMAIL_SENT: "Письмо",
  EMAIL_FAILED: "Письмо",
  EMAIL_ATTEMPT: "Письмо",
  CHECK_IN: "Проход",
  ORDER_CANCELLED: "Отмена",
  REFUND_CREATED: "Возврат",
  REFUND_SUCCEEDED: "Возврат",
  WEBHOOK_RECEIVED: "Вебхук",
};

export function labelTimelineType(value: string): string {
  return TIMELINE_TYPE_LABELS[value] ?? value;
}

const CONFIG_LABELS: Record<string, string> = {
  Configured: "Настроено",
  "Not configured": "Не настроено",
  Connected: "Подключена",
  Error: "Ошибка",
};

export function labelConfig(value: string): string {
  return CONFIG_LABELS[value] ?? labelStatus(value);
}

const INTEGRATION_LABELS: Record<string, string> = {
  yookassa: "ЮKassa",
  postbox: "Почта",
  maps: "Яндекс Карты",
  errorMonitoring: "Мониторинг ошибок",
};

export function labelIntegration(value: string): string {
  return INTEGRATION_LABELS[value] ?? value;
}

const DASHBOARD_KEY_LABELS: Record<string, string> = {
  ordersToday: "Заказы сегодня",
  paidToday: "Оплачено сегодня",
  awaitingPayment: "Ожидают оплаты",
  cancelledToday: "Отмены сегодня",
  refundedToday: "Возвраты сегодня",
  issuedToday: "Выдано сегодня",
  usedToday: "Проходы сегодня",
  cancelled: "Отменены",
  refunded: "Возвраты",
  DISABLED: "Отключены",
};

export function labelDashboardKey(value: string): string {
  return DASHBOARD_KEY_LABELS[value] ?? ROLE_LABELS[value] ?? STATUS_LABELS[value] ?? value;
}
