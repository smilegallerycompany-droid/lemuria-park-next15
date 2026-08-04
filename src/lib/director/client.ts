import type { ApiErrorBody, ApiSuccessBody } from "@/types/api";

export class DirectorApiError extends Error {
  code: string;
  details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = "DirectorApiError";
    this.code = code;
    this.details = details;
  }
}

export async function directorFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...init, headers, credentials: "include" });
  const payload = (await response.json()) as ApiSuccessBody<T> | ApiErrorBody;

  if (!payload.ok) {
    throw new DirectorApiError(payload.error.message, payload.error.code, payload.error.details);
  }

  return payload.data;
}

export function formatDateTime(iso: string, timeZone = "Europe/Moscow"): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

export const DAY_LABELS: Record<string, string> = {
  MONDAY: "Пн",
  TUESDAY: "Вт",
  WEDNESDAY: "Ср",
  THURSDAY: "Чт",
  FRIDAY: "Пт",
  SATURDAY: "Сб",
  SUNDAY: "Вс",
};

export const WEEK_DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;
