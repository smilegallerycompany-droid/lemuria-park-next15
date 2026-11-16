"use strict";

const { isBreak } = require("./session-break-policy.cjs");

const action = "CASHIER_BREAK_OVERRIDE_STATE";
const slots = [
  { time: "13:00", label: "13:00–13:30" },
  { time: "17:00", label: "17:00–17:30" },
];
const hour = 60 * 60 * 1000;
const scheduled = ["SCHEDULED", "OPEN"];

function localParts(value, location) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: location.timezone || "Europe/Saratov",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(value).map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function stateId(locationId, date, time) {
  return `cashier-break:${locationId}:${date}:${time}`;
}

function isSupported(location) {
  return location?.slug === "saratov" && location.park === "LEMURIA";
}

function currentSlot(session, location, now) {
  if (session.park !== location.park || !scheduled.includes(session.status) || session.endsAt <= now) {
    return null;
  }
  const start = localParts(session.startsAt, location);
  return start.date === localParts(now, location).date && slots.some((slot) => slot.time === start.time)
    ? start.time : null;
}

async function states(db, location, date) {
  const ids = slots.map((slot) => stateId(location.id, date, slot.time));
  const entries = await db.auditLog.findMany({
    where: { id: { in: ids }, action },
    select: { id: true, after: true },
  });
  return new Set(entries.filter((entry) => entry.after?.open === true).map((entry) => entry.id));
}

async function filterCandidates(db, params, rows, now = new Date()) {
  if (!rows.length) return rows;
  const location = await db.location.findUnique({ where: { id: params.locationId } });
  if (!isSupported(location)) return rows.filter((session) => !isBreak(session, location));
  const date = localParts(now, location).date;
  const open = await states(db, location, date);
  return rows.filter((session) => {
    if (!isBreak(session, location)) return true;
    const time = currentSlot(session, location, now);
    return time !== null && open.has(stateId(location.id, date, time));
  });
}

async function findForCashier(db, publicId, now = new Date()) {
  const session = await db.session.findUnique({ where: { publicId }, include: { location: true } });
  if (!isBreak(session)) return session;
  const { location } = session;
  if (!isSupported(location)) return null;
  const time = currentSlot(session, location, now);
  if (time === null) return null;
  const record = await db.auditLog.findUnique({
    where: { id: stateId(location.id, localParts(now, location).date, time) },
    select: { action: true, after: true },
  });
  return record?.action === action && record.after?.open === true ? session : null;
}

async function getControls(db, location, now) {
  const { date } = localParts(now, location);
  const [rows, open] = await Promise.all([
    db.session.findMany({
      where: {
        locationId: location.id, park: location.park,
        startsAt: { gte: new Date(+now - 24 * hour), lt: new Date(+now + 24 * hour) },
      },
      select: { startsAt: true, endsAt: true, status: true, park: true },
    }),
    states(db, location, date),
  ]);
  const available = location.status === "ACTIVE" &&
    (!location.activeTo || location.activeTo > now);
  return { date, slots: slots.map(({ time, label }) => {
    const matching = rows.filter((session) => {
      const start = localParts(session.startsAt, location);
      return start.date === date && start.time === time;
    });
    const canToggle = Boolean(available && matching.some((session) => currentSlot(session, location, now)));
    return {
      time, label, canToggle,
      open: canToggle && open.has(stateId(location.id, date, time)),
      unavailableReason: !available ? "Продажи закрыты" :
        (matching.length && matching.every((session) => session.endsAt <= now)
          ? "Сеанс завершён" : "Сеанс недоступен"),
    };
  }) };
}

async function forShift(db, shift, locationId, now = new Date()) {
  if (!shift || shift.locationId !== locationId) return null;
  const location = await db.location.findUnique({ where: { id: locationId } });
  return isSupported(location) ? getControls(db, location, now) : null;
}

async function setOverride(db, actorId, input, { ErrorType, lockActor, lockShift, assertScope }) {
  const { shiftId, time, open, date } = input;
  if (typeof shiftId !== "string" || !shiftId || shiftId.length > 128 ||
      !slots.some((slot) => slot.time === time) || typeof open !== "boolean" ||
      typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ErrorType("VALIDATION_ERROR", "Выберите перерыв на 13:00 или 17:00");
  }
  return db.$transaction(async (tx) => {
    await lockActor(tx, actorId);
    await lockShift(tx, shiftId);
    const shift = await tx.cashierShift.findUnique({
      where: { id: shiftId },
      select: { id: true, userId: true, status: true, location: true },
    });
    if (!shift || shift.userId !== actorId) {
      throw new ErrorType("FORBIDDEN", "Управлять перерывами можно только в своей смене");
    }
    await assertScope(tx, actorId, shift.location.id);
    if (shift.status !== "OPEN" || !isSupported(shift.location)) {
      throw new ErrorType("VALIDATION_ERROR", "Откройте смену в Лемурия Парке в Саратове");
    }
    const now = new Date();
    if (date !== localParts(now, shift.location).date) {
      throw new ErrorType("VALIDATION_ERROR", "Дата сменилась. Обновите кассу");
    }
    const controls = await getControls(tx, shift.location, now);
    if (!controls.slots.find((slot) => slot.time === time)?.canToggle) {
      throw new ErrorType("SESSION_NOT_AVAILABLE", "Этот сеанс больше нельзя открыть для продаж");
    }
    const id = stateId(shift.location.id, date, time);
    const values = { actorId, after: { open }, metadata: { shiftId, date, time } };
    await tx.auditLog.upsert({
      where: { id },
      create: { id, action, entityType: "CashierBreak", entityId: shift.location.id, ...values },
      update: values,
    });
    return { ...controls, slots: controls.slots.map((slot) => slot.time === time ? { ...slot, open } : slot) };
  });
}

module.exports = { filterCandidates, findForCashier, forShift, setOverride };
