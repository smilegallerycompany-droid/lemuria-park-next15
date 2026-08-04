import type { DayOfWeek } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { formatDateInTimezone, addDaysUtc } from "@/lib/datetime";
import type { DbClient } from "@/lib/db/prisma";

const JS_DAY_TO_ENUM: DayOfWeek[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

function parseMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Maps local calendar date + HH:MM in IANA timezone to a UTC instant. */
export function localDateTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let deltaHours = -14; deltaHours <= 14; deltaHours += 1) {
    const candidate = new Date(guess + deltaHours * 60 * 60 * 1000);
    const formattedDate = formatDateInTimezone(candidate, timeZone);
    const formattedTime = new Intl.DateTimeFormat("ru-RU", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(candidate);
    const normalizedTime = formattedTime.replace(".", ":");
    if (formattedDate === dateKey && normalizedTime === time) {
      return candidate;
    }
  }
  return new Date(guess);
}

export type GenerateSessionsResult = {
  locationId: string;
  windowDays: number;
  created: number;
  skippedExisting: number;
};

/**
 * Generates sessions for a rolling forward window from LocationSchedule.
 * Skips slots where a session with the same locationId + startsAt already exists.
 */
export async function generateSessionsForLocation(
  db: DbClient,
  params: { locationId: string; windowDays?: number; from?: Date },
): Promise<GenerateSessionsResult> {
  const location = await db.location.findUnique({
    where: { id: params.locationId },
    include: { schedules: true },
  });
  if (!location) {
    throw new Error("LOCATION_NOT_FOUND");
  }

  const settings = await db.siteSettings.findFirst({ orderBy: { createdAt: "asc" } });
  const windowDays = params.windowDays ?? settings?.sessionGenerationDays ?? 60;
  const scheduleByDay = new Map(location.schedules.map((row) => [row.dayOfWeek, row]));
  const timeZone = location.timezone;
  const startAnchor = params.from ?? new Date();

  let created = 0;
  let skippedExisting = 0;

  for (let dayOffset = 0; dayOffset < windowDays; dayOffset += 1) {
    const dayInstant = addDaysUtc(startAnchor, dayOffset);
    const dateKey = formatDateInTimezone(dayInstant, timeZone);
    const noonProbe = localDateTimeToUtc(dateKey, "12:00", timeZone);
    const dayOfWeek = JS_DAY_TO_ENUM[noonProbe.getUTCDay()];
    const schedule = scheduleByDay.get(dayOfWeek);
    if (!schedule || schedule.isClosed) continue;

    const interval = schedule.sessionIntervalMinutes ?? location.sessionIntervalMinutes;
    const opensAtMinutes = parseMinutes(schedule.opensAt);
    const closesAtMinutes = parseMinutes(schedule.closesAt);

    for (
      let minutes = opensAtMinutes;
      minutes + location.visitDurationMinutes <= closesAtMinutes;
      minutes += interval
    ) {
      const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
      const mm = String(minutes % 60).padStart(2, "0");
      const startsAt = localDateTimeToUtc(dateKey, `${hh}:${mm}`, timeZone);
      const endsAt = new Date(startsAt.getTime() + location.visitDurationMinutes * 60 * 1000);

      const existing = await db.session.findUnique({
        where: { locationId_startsAt: { locationId: location.id, startsAt } },
        select: { id: true },
      });
      if (existing) {
        skippedExisting += 1;
        continue;
      }

      await db.session.create({
        data: {
          locationId: location.id,
          startsAt,
          endsAt,
          capacity: location.defaultCapacity,
          status: "SCHEDULED",
        },
      });
      created += 1;
    }
  }

  return { locationId: location.id, windowDays, created, skippedExisting };
}

export async function generateSessionsForLocationId(
  locationId: string,
  windowDays?: number,
): Promise<GenerateSessionsResult> {
  return generateSessionsForLocation(prisma, { locationId, windowDays });
}
