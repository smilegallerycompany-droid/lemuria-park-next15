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
