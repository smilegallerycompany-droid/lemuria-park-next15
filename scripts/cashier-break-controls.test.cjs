"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const policy = require("./cashier-break-controls.cjs");
const standard = require("./session-break-policy.cjs");

const location = { id: "location-1", slug: "saratov", park: "LEMURIA", timezone: "Europe/Saratov", status: "ACTIVE" };
const date = "2026-11-16";
const now = new Date(date + "T12:55:00+04:00");
const session = (time, on = date, where = location) => ({
  publicId: time + on,
  location: where,
  park: where.park,
  status: "OPEN",
  startsAt: new Date(on + "T" + time + ":00+04:00"),
  endsAt: new Date(+new Date(on + "T" + time + ":00+04:00") + 20 * 60_000),
});

function fixture(where = location) {
  const rows = [session("12:30"), session("13:00"), session("13:15"), session("17:00"), session("13:00", "2026-11-17")];
  const records = new Map();
  const shift = { id: "shift", userId: "actor", locationId: where.id, location: where, status: "OPEN" };
  const db = {
    $transaction: async (fn) => fn(db),
    cashierShift: { findUnique: async ({ where: { id } }) => id === shift.id ? shift : null },
    location: { findUnique: async () => where },
    session: {
      findMany: async () => rows,
      findUnique: async ({ where: { publicId } }) => rows.find((row) => row.publicId === publicId) ?? null,
    },
    auditLog: {
      findMany: async ({ where: { id: { in: ids }, action } }) =>
        ids.map((id) => records.get(id)).filter((row) => row?.action === action),
      findUnique: async ({ where: { id } }) => records.get(id),
      upsert: async ({ where: { id }, create, update }) => {
        records.set(id, records.has(id) ? { ...records.get(id), ...update } : create);
      },
    },
  };
  return { rows, db, shift, records };
}

class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const callbacks = {
  ErrorType: DomainError,
  lockActor: async () => {},
  lockShift: async () => {},
  assertScope: async () => {},
};
const toggle = (db, actorId, fields) => policy.setOverride(db, actorId, {
  shiftId: "shift", time: "13:00", date, open: true, ...fields,
}, callbacks);

test("opens each current-day cashier session independently and restores the break", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const { rows, db, shift, records } = fixture();
  const before = await policy.forShift(db, shift, location.id, now);
  assert.ok(before.slots.every((slot) => slot.canToggle && !slot.open));
  assert.deepEqual(await standard.filterCandidates(db, { locationId: location.id }, rows), [rows[0]]);
  assert.deepEqual(await policy.filterCandidates(db, { locationId: location.id }, rows, now), [rows[0]]);
  assert.equal(await policy.findForCashier(db, rows[1].publicId, now), null);
  const result = await toggle(db, "actor");
  assert.deepEqual(result.slots.map((slot) => slot.open), [true, false]);
  assert.equal(records.size, 1);
  const query = { locationId: location.id, statuses: ["OPEN", "SCHEDULED"] };
  assert.deepEqual(await policy.listForCashier(db, query, now), [rows[0], rows[1]]);
  assert.deepEqual(await policy.filterCandidates(db, { locationId: location.id }, rows, now), [rows[0], rows[1]]);
  assert.deepEqual(await standard.filterCandidates(db, { locationId: location.id }, rows), [rows[0]]);
  assert.equal(standard.isBreak(rows[1]), true);
  assert.equal(await policy.findForCashier(db, rows[1].publicId, new Date(date + "T13:02:00+04:00")), rows[1]);
  assert.equal(await policy.findForCashier(db, rows[1].publicId, new Date(date + "T13:20:00+04:00")), null);
  assert.equal(await policy.findForCashier(db, rows[4].publicId, new Date("2026-11-17T12:55:00+04:00")), null);
  assert.equal((await toggle(db, "actor", { time: "17:00" })).slots[1].open, true);
  assert.deepEqual((await toggle(db, "actor", { open: false })).slots.map((slot) => slot.open), [false, true]);
  assert.equal(await policy.findForCashier(db, rows[1].publicId, now), null);
  assert.equal(await policy.findForCashier(db, rows[3].publicId, now), rows[3]);
  assert.deepEqual(await policy.listForCashier(db, query, now), [rows[0], rows[3]]);
});

test("rejects a changed local date, inactive shift, out-of-scope user and completed session", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const { db, shift, records } = fixture();
  await assert.rejects(toggle(db, "other"), { code: "FORBIDDEN" });
  await assert.rejects(toggle(db, "actor", { date: "2026-11-17" }), { code: "VALIDATION_ERROR" });
  await assert.rejects(toggle(db, "actor", { time: "13:15" }), { code: "VALIDATION_ERROR" });
  await assert.rejects(policy.setOverride(db, "actor", { shiftId: "shift", time: "13:00", date, open: true }, {
    ...callbacks,
    assertScope: async () => { throw new DomainError("FORBIDDEN"); },
  }), { code: "FORBIDDEN" });
  shift.status = "CLOSED";
  await assert.rejects(toggle(db, "actor"), { code: "VALIDATION_ERROR" });
  shift.status = "OPEN";
  t.mock.timers.setTime(+new Date(date + "T13:20:00+04:00"));
  await assert.rejects(toggle(db, "actor"), { code: "SESSION_NOT_AVAILABLE" });
  assert.equal(records.size, 0);
  assert.equal(await policy.forShift(db, shift, "other-location", now), null);
  const other = fixture({ ...location, slug: "other-city" });
  assert.equal(await policy.forShift(other.db, other.shift, location.id, now), null);
  await assert.rejects(toggle(other.db, "actor"), { code: "VALIDATION_ERROR" });
});
