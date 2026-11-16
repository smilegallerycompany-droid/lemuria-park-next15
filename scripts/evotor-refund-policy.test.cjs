"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { prepareRefund, verifyRefundResult } = require("./evotor-refund-policy.cjs");

const id = (last) => "00000000-0000-4000-8000-" + String(last).padStart(12, "0");
const receipt = (documentNumber) => ({ serial: "1234567890123456", documentNumber, fiscalSign: "123" });
const actor = { id: "cashier", shiftId: "shift", shiftStatus: "OPEN", locationId: "park" };
const ticket = { id: "t", publicId: "ticket", orderItemId: "child", status: "VALID" };
const order = {
  id: "order", cashierId: "cashier", shiftId: "shift", locationId: "park", source: "CASHIER", status: "PAID",
  tickets: [ticket], extras: [{ id: "feed" }],
};
const original = {
  orderId: "order", deviceId: "evotor", receiptId: id(1), state: "FISCALIZED", receipt: receipt("15"),
  paymentMethod: "CARD_TERMINAL", positions: [
    { kind: "TICKET", sourceId: "child", positionId: id(2), quantity: 2, unitPriceAmount: 80000 },
    { kind: "EXTRA", sourceId: "feed", positionId: id(3), quantity: 3, unitPriceAmount: 30000 },
  ],
};
const request = (overrides = {}) => prepareRefund({
  order, actor, original, selection: { kind: "TICKET", id: "ticket", quantity: 1 },
  refundedQuantity: new Map(), pendingTicketIds: new Set(), ...overrides,
});

test("takes the single child's real price and original terminal payment method", () => {
  const job = request();
  assert.equal(job.ticketId, "t");
  assert.equal(job.amount, 80000);
  assert.equal(job.positionId, id(2));
  assert.equal(job.paymentMethod, "CARD_TERMINAL");
});

test("returns one unit of a product and enforces the unrefunded quantity", () => {
  const quantity = new Map([[id(3), 2]]);
  const input = { selection: { kind: "EXTRA", id: "feed", quantity: 1 }, refundedQuantity: quantity };
  assert.equal(request(input).amount, 30000);
  assert.throws(() => request({ ...input, selection: { ...input.selection, quantity: 2 } }),
    { code: "QUANTITY_UNAVAILABLE" });
});

test("requires the original fiscal sale, the cashier's shift and an unused ticket", () => {
  assert.throws(() => request({ pendingTicketIds: new Set(["t"]) }), { code: "REFUND_PENDING" });
  assert.throws(() => request({ original: null }), { code: "ORIGINAL_RECEIPT_REQUIRED" });
  assert.throws(() => request({ actor: { ...actor, id: "other" } }), { code: "FORBIDDEN" });
  assert.throws(() => request({ order: { ...order, tickets: [{ ...ticket, status: "USED" }] } }),
    { code: "ITEM_NOT_REFUNDABLE" });
});

test("matches Evotor fiscal proof to the device and refund, and keeps uncertainty pending", () => {
  const job = { id: "job", ...request() };
  const result = {
    jobId: job.id, originalReceiptId: original.receiptId, receiptId: id(4),
    outcome: "FISCALIZED", settlementType: "SALE_REFUND", receipt: receipt("16"),
    paymentMethod: "CARD_TERMINAL", amount: 80000, positions: [{ originalPositionId: id(2), quantity: 1 }],
  };
  assert.deepEqual(verifyRefundResult(job, "evotor", result),
    { state: "FISCALIZED", receiptKey: "1234567890123456/16", receiptId: id(4) });
  assert.deepEqual(verifyRefundResult(job, "evotor", { ...result, outcome: "UNKNOWN" }),
    { state: "RECONCILIATION_REQUIRED" });
  assert.throws(() => verifyRefundResult(job, "other", result), { code: "RESULT_MISMATCH" });
  assert.throws(() => verifyRefundResult(job, "evotor", { ...result, amount: 90000 }),
    { code: "FISCAL_PROOF_MISMATCH" });
  assert.throws(() => verifyRefundResult(job, "evotor", { ...result, receipt: original.receipt }),
    { code: "FISCAL_PROOF_MISMATCH" });
});
