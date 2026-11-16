"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { exchange } = require("./cashier-ticket-correction.cjs");

class ApiError extends Error {
  constructor(code, text, status) {
    super(text);
    this.code = code;
    this.status = status;
  }
}

function scenario(method = "CASH") {
  const date = new Date("2026-11-16T09:30:00Z");
  const child = { id: "CHILD", code: "CHILD", name: "Детский", isActive: true, availableAtCashier: true };
  const adult = { id: "ADULT", code: "ADULT", name: "Взрослый", isActive: true, availableAtCashier: true };
  const item = { id: "line", ticketTypeId: child.id, ticketTypeName: child.name, quantity: 2, unitPriceAmount: 80000,
    subtotalAmount: 160000, updatedAt: date };
  const tickets = ["ticket-1", "ticket-2"].map((id) => ({
    id, publicId: id, qrToken: id + "-qr", status: "VALID", sessionId: "session",
    ticketTypeId: child.id, ticketType: child, orderItem: item, orderItemId: item.id, updatedAt: date,
  }));
  const payment = { id: "paid", status: "SUCCEEDED", method, amount: 190000, updatedAt: date };
  const order = {
    id: "order", source: "CASHIER", cashierId: "cashier", totalAmount: 190000, status: "PAID",
    shiftId: "shift", updatedAt: date, refunds: [], items: [item], payments: [payment], tickets,
    shift: { userId: "cashier", status: "OPEN", locationId: "park" }, sessionId: "session",
    session: { locationId: "park", startsAt: date, park: "LEMURIA", location: { timezone: "Europe/Saratov" } },
  };
  const edits = [];
  const audits = new Map();
  function apply(row, data) {
    for (const [key, value] of Object.entries(data)) {
      row[key] = typeof value === "object" ? row[key] + (value.increment ?? -value.decrement) : value;
    }
    row.updatedAt = new Date(+row.updatedAt + 1);
    return row;
  }
  const types = { CHILD: child, ADULT: adult };
  const db = {
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, "Serializable");
      return callback(db);
    },
    order: { findUnique: async () => order, update: async ({ data }) => apply(order, data) },
    ticketType: { findUnique: async ({ where: { code } }) => types[code] },
    orderItem: {
      update: async ({ where, data }) => apply(order.items.find((row) => row.id === where.id), data),
      create: async ({ data }) => {
        const row = { ...data, id: "line-" + data.ticketTypeId, updatedAt: date };
        order.items.push(row);
        return row;
      },
      delete: async ({ where }) => { order.items = order.items.filter((row) => row.id !== where.id); },
    },
    ticket: { updateMany: async ({ where, data }) => {
      const row = tickets.find((entry) => entry.id === where.id);
      apply(row, data);
      row.ticketType = types[row.ticketTypeId];
      row.orderItem = order.items.find((item) => item.id === row.orderItemId);
      return { count: 1 };
    } },
    payment: { update: async ({ data }) => apply(payment, data) },
    cashierShift: { update: async ({ data }) => edits.push(data) },
    cashOperation: { create: async ({ data }) => edits.push(data) },
    auditLog: {
      findUnique: async ({ where }) => audits.get(where.id),
      create: async ({ data }) => audits.set(data.id, data),
    },
  };
  const actor = { id: "cashier" };
  const dependencies = {
    ApiError, canAccess: (_, id) => id === "park", assertScope: async () => {},
    lockActor: async () => {}, lockShift: async () => {},
    resolvePrice: async (_, { ticketTypeId }) => ({ unitPriceAmount: ticketTypeId === "ADULT" ? 90000 : 80000 }),
  };
  const process = (action, fields = {}, acting = actor) => exchange(db, {
    actor: acting, number: "LP-100", body: { action, ticketId: "ticket-1", ...fields },
  }, dependencies);
  return { process, order, item, tickets, payment, edits, audits };
}

test("changes one ticket, keeps the QR, updates cash totals, and makes retries idempotent", async () => {
  const { process, order, payment, tickets, edits, audits } = scenario();
  const preview = await process("preview");
  assert.equal(preview.before, "Детский");
  assert.equal(preview.after, "Взрослый");
  assert.equal(preview.delta, 10000);
  const fields = { version: preview.version, originalDocument: "1234567890123456/12",
    correctionDocument: "1234567890123456/13", settled: true };
  const correction = await process("confirm", fields);
  assert.equal(correction.totalAmount, 200000);
  assert.equal(payment.amount, 200000);
  assert.deepEqual(order.items.map((row) => row.quantity), [1, 1]);
  assert.equal(tickets[0].ticketTypeId, "ADULT");
  assert.equal(tickets[0].qrToken, "ticket-1-qr");
  assert.equal(tickets[1].ticketTypeId, "CHILD");
  assert.deepEqual(edits[0], { cashSalesAmount: { increment: 10000 } });
  assert.equal(edits[1].amount, 10000);
  assert.deepEqual(await process("confirm", fields), correction);
  assert.equal(audits.size, 1);
  assert.equal(edits.length, 2);
  await assert.rejects(process("confirm", { ...fields, ticketId: "ticket-2" }), { code: "IDEMPOTENCY_CONFLICT" });
});

test("rejects foreign and online orders, stale quotes, and confirmations without documents", async () => {
  const { process, order, audits } = scenario("CARD_TERMINAL");
  await assert.rejects(process("preview", {}, { id: "another-cashier" }), { code: "FORBIDDEN" });
  const preview = await process("preview");
  await assert.rejects(process("confirm", { version: preview.version }), { code: "VALIDATION_ERROR" });
  order.updatedAt = new Date(+order.updatedAt + 1);
  await assert.rejects(process("confirm", { version: preview.version, originalDocument: "1234567890123456/12",
    correctionDocument: "1234567890123456/13", settled: true }), { code: "IDEMPOTENCY_CONFLICT" });
  order.source = "ONLINE";
  await assert.rejects(process("preview"), { code: "FORBIDDEN" });
  assert.equal(audits.size, 0);
});
