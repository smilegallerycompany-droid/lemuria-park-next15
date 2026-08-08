import {
  formatDateInTimezone,
  startOfLocalDateInTimezone,
  todayInTimezone,
} from "@/lib/datetime";

function addCalendarDays(dateKey: string, days: number, timeZone: string): string {
  const start = startOfLocalDateInTimezone(dateKey, timeZone);
  const shifted = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return formatDateInTimezone(shifted, timeZone);
}

export function endOfLocalDateInTimezone(dateKey: string, timeZone: string): Date {
  const nextKey = addCalendarDays(dateKey, 1, timeZone);
  return new Date(startOfLocalDateInTimezone(nextKey, timeZone).getTime() - 1);
}

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "this_month"
  | "prev_month"
  | "custom";

export function resolveAnalyticsPeriod(params: {
  preset?: PeriodPreset;
  from?: string;
  to?: string;
  timeZone: string;
  now?: Date;
}): { from: Date; to: Date; preset: PeriodPreset } {
  const now = params.now ?? new Date();
  const tz = params.timeZone;
  const todayKey = todayInTimezone(tz, now);

  if (params.preset === "custom" || (!params.preset && params.from && params.to)) {
    const from = params.from
      ? new Date(params.from)
      : startOfLocalDateInTimezone(todayKey, tz);
    const to = params.to ? new Date(params.to) : endOfLocalDateInTimezone(todayKey, tz);
    return { from, to, preset: "custom" };
  }

  const preset = params.preset ?? "today";

  if (preset === "today") {
    return {
      from: startOfLocalDateInTimezone(todayKey, tz),
      to: endOfLocalDateInTimezone(todayKey, tz),
      preset,
    };
  }

  if (preset === "yesterday") {
    const yKey = addCalendarDays(todayKey, -1, tz);
    return {
      from: startOfLocalDateInTimezone(yKey, tz),
      to: endOfLocalDateInTimezone(yKey, tz),
      preset,
    };
  }

  if (preset === "last_7") {
    const fromKey = addCalendarDays(todayKey, -6, tz);
    return {
      from: startOfLocalDateInTimezone(fromKey, tz),
      to: endOfLocalDateInTimezone(todayKey, tz),
      preset,
    };
  }

  if (preset === "last_30") {
    const fromKey = addCalendarDays(todayKey, -29, tz);
    return {
      from: startOfLocalDateInTimezone(fromKey, tz),
      to: endOfLocalDateInTimezone(todayKey, tz),
      preset,
    };
  }

  // Month presets: use calendar month in location timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);

  if (preset === "this_month") {
    const fromKey = `${year}-${String(month).padStart(2, "0")}-01`;
    return {
      from: startOfLocalDateInTimezone(fromKey, tz),
      to: endOfLocalDateInTimezone(todayKey, tz),
      preset,
    };
  }

  // prev_month
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const fromKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const nextMonthStart =
    month === 1
      ? `${year}-01-01`
      : `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDayKey = addCalendarDays(nextMonthStart, -1, tz);
  return {
    from: startOfLocalDateInTimezone(fromKey, tz),
    to: endOfLocalDateInTimezone(lastDayKey, tz),
    preset,
  };
}
