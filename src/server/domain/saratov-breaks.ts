import { formatDateInTimezone, formatTimeInTimezone } from "@/lib/datetime";

export const SARATOV_BREAK_TIMES = ["13:00", "17:00"] as const;
export type SaratovBreakTime = (typeof SARATOV_BREAK_TIMES)[number];

export function isSaratovBreakDate(slug: string, date: string) {
  return slug === "saratov" && date >= "2026-11-07";
}

export function isSaratovBreak(at: Date, location: { slug: string; timezone: string }) {
  if (location.slug !== "saratov") return false;
  const date = formatDateInTimezone(at, location.timezone);
  if (!isSaratovBreakDate(location.slug, date)) return false;
  const time = formatTimeInTimezone(at, location.timezone);
  return (time >= "13:00" && time < "13:30") || (time >= "17:00" && time < "17:30");
}
