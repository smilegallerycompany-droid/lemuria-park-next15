import { prisma, type DbClient } from "@/lib/db/prisma";
import {
  dayOfWeekInTimezone,
  formatTimeInTimezone,
  startOfLocalDateInTimezone,
  todayInTimezone,
} from "@/lib/datetime";
import type { StaffUser } from "@/server/auth/staff-session";
import { assertLocationAccess } from "@/server/auth/location-access";
import { DomainError } from "@/server/domain/errors";
import { isSaratovBreakDate, type SaratovBreakTime } from "@/server/domain/saratov-breaks";
import { isSessionSellableAtCashier } from "@/server/domain/session.domain";
import { locationRepository } from "@/server/repositories/location.repository";
import { sessionRepository } from "@/server/repositories/session.repository";
import { getOpenShiftForCashier } from "@/server/services/cashier-shifts";

const ENTITY = "CashierBreakSession";
const OPEN = "CASHIER_BREAK_CANCELLED";
const CLOSE = "CASHIER_BREAK_RESTORED";

export async function getCancelledBreakSessionIds(db: DbClient, sessionIds: string[]) {
  if (sessionIds.length === 0) return new Set<string>();
  const latest = await db.auditLog.findMany({
    where: { entityType: ENTITY, entityId: { in: sessionIds }, action: { in: [OPEN, CLOSE] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    distinct: ["entityId"],
    select: { entityId: true, action: true },
  });
  return new Set(
    latest.flatMap((event) => (event.action === OPEN && event.entityId ? [event.entityId] : [])),
  );
}

export async function setCashierBreak(
  actor: StaffUser,
  input: { date: string; time: SaratovBreakTime; cancelled: boolean },
) {
  return prisma.$transaction(async (tx) => {
    const shift = await getOpenShiftForCashier(tx, actor.id);
    if (!shift) throw new DomainError("SHIFT_NOT_OPEN", "Откройте смену, чтобы изменить перерыв");
    assertLocationAccess(actor, shift.locationId);
    const now = new Date();
    const location = await locationRepository.findById(tx, shift.locationId);
    if (
      !location ||
      location.status !== "ACTIVE" ||
      !isSaratovBreakDate(location.slug, input.date) ||
      input.date !== todayInTimezone(location.timezone, now)
    ) {
      throw new DomainError(
        "SESSION_NOT_AVAILABLE",
        "Перерыв можно изменить только на сегодня в Саратове",
      );
    }

    const [hour, minute] = input.time.split(":").map(Number);
    const midnight = startOfLocalDateInTimezone(input.date, location.timezone);
    const startsAt = new Date(+midnight + (hour * 60 + minute) * 60_000);
    const endsAt = new Date(+startsAt + location.visitDurationMinutes * 60_000);
    const schedule = await tx.locationSchedule.findUnique({
      where: {
        locationId_dayOfWeek: {
          locationId: location.id,
          dayOfWeek: dayOfWeekInTimezone(startsAt, location.timezone),
        },
      },
    });
    if (
      !schedule ||
      schedule.isClosed ||
      input.time < schedule.opensAt ||
      formatTimeInTimezone(endsAt, location.timezone) > schedule.closesAt ||
      (location.activeFrom && startsAt < location.activeFrom) ||
      (location.activeTo && startsAt > location.activeTo)
    ) {
      throw new DomainError("SESSION_NOT_AVAILABLE", "Это время вне расписания локации");
    }

    const key = { locationId: location.id, startsAt };
    if (endsAt <= now) throw new DomainError("SESSION_NOT_AVAILABLE", "Сеанс уже закончился");
    const session = input.cancelled
      ? await tx.session.upsert({
          where: { locationId_startsAt: key },
          create: { ...key, endsAt, capacity: location.defaultCapacity },
          update: { startsAt },
        })
      : await tx.session.findUnique({ where: { locationId_startsAt: key } });
    if (!session) return { cancelled: false };

    await sessionRepository.lockForUpdate(tx, session.id);
    const current = await sessionRepository.findById(tx, session.id);
    if (!current || !isSessionSellableAtCashier(current, new Date())) {
      throw new DomainError("SESSION_NOT_AVAILABLE", "Сеанс закрыт или уже закончился");
    }
    const previous = await tx.auditLog.findFirst({
      where: { entityType: ENTITY, entityId: session.id, action: { in: [OPEN, CLOSE] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { action: true, createdAt: true },
    });
    if ((previous?.action === OPEN) !== input.cancelled) {
      // A concurrent sale must re-read the break state. Timestamp the decision after obtaining the lock.
      const changedAt = new Date(Math.max(Date.now(), previous ? +previous.createdAt + 1 : 0));
      await tx.session.update({ where: { id: session.id }, data: { updatedAt: changedAt } });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          entityType: ENTITY,
          entityId: session.id,
          action: input.cancelled ? OPEN : CLOSE,
          createdAt: changedAt,
          metadata: {
            locationId: location.id,
            shiftId: shift.id,
            date: input.date,
            time: input.time,
          },
        },
      });
    }
    return { cancelled: input.cancelled };
  });
}
