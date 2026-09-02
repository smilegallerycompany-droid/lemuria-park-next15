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
  // Explicit `timeZone: timeZone` — avoids a SWC minify bug where object
  // shorthand `{ timeZone }` can be left as a free identifier after rename.
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone,
    weekday: "long",
  }).format(date);
  return WEEKDAY_MAP[weekday] ?? "MONDAY";
}

export function isWeekendInTimezone(date: Date, timeZone: string): boolean {
  const dayOfWeek = dayOfWeekInTimezone(date, timeZone);
  return dayOfWeek === "SATURDAY" || dayOfWeek === "SUNDAY";
}

/** Formats an instant as a `YYYY-MM-DD` calendar date in the given IANA timezone. */
export function formatDateInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Formats an instant as a 24h `HH:MM` clock time in the given IANA timezone. */
export function formatTimeInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timeZone,
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

/**
 * Best-effort UTC instant for local midnight of `YYYY-MM-DD` in an IANA
 * timezone — used for "today" filters without pulling in a date library.
 */
export function startOfLocalDateInTimezone(dateKey: string, timeZone: string): Date {
  const probe = new Date(`${dateKey}T00:00:00.000Z`);
  // ±18h covers all IANA offsets. 15-minute steps catch :00 local midnight
  // (UTC+3 Moscow midnight is -3h from this probe — the old ±14h search
  // from T12:00Z missed it and fell back to 03:00 MSK, dropping overnight sales).
  for (let offsetMin = -18 * 60; offsetMin <= 18 * 60; offsetMin += 15) {
    const candidate = new Date(probe.getTime() + offsetMin * 60 * 1000);
    if (
      formatDateInTimezone(candidate, timeZone) === dateKey &&
      formatTimeInTimezone(candidate, timeZone) === "00:00"
    ) {
      return candidate;
    }
  }
  return probe;
}
