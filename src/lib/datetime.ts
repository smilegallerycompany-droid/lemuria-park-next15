import type { DayOfWeek } from "@prisma/client";

const WEEKDAY_MAP: Record<string, DayOfWeek> = {
  Monday: "MONDAY",
  Tuesday: "TUESDAY",
  Wednesday: "WEDNESDAY",
  Thursday: "THURSDAY",
  Friday: "FRIDAY",
  Saturday: "SATURDAY",
  Sunday: "SUNDAY",
};

/**
 * Resolves the day of week for a given instant in a specific IANA timezone,
 * using the platform `Intl` API — no extra date/timezone library needed.
 */
export function dayOfWeekInTimezone(date: Date, timeZone: string): DayOfWeek {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(date);
  return WEEKDAY_MAP[weekday] ?? "MONDAY";
}

export function isWeekendInTimezone(date: Date, timeZone: string): boolean {
  const dayOfWeek = dayOfWeekInTimezone(date, timeZone);
  return dayOfWeek === "SATURDAY" || dayOfWeek === "SUNDAY";
}

/** Formats an instant as a `YYYY-MM-DD` calendar date in the given IANA timezone. */
export function formatDateInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Formats an instant as a 24h `HH:MM` clock time in the given IANA timezone. */
export function formatTimeInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** `YYYY-MM-DD` for "now" in the given IANA timezone — used to default date-scoped queries. */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  return formatDateInTimezone(now, timeZone);
}

/** Adds N calendar days (as UTC-anchored 24h steps) to an instant. Used for coarse date-range math only. */
export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
