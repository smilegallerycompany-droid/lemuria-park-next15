"use strict";

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const methods = new Set(["CASH", "CARD_TERMINAL"]);

class EvotorRefundError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function validFiscalReceipt(receipt) {
  return receipt && typeof receipt.serial === "string" && /^[0-9]{16}$/.test(receipt.serial) &&
    typeof receipt.documentNumber === "string" && /^[1-9][0-9]{0,9}$/.test(receipt.documentNumber) &&
    typeof receipt.fiscalSign === "string" && /^[0-9]{1,10}$/.test(receipt.fiscalSign);
}

function receiptKey(receipt) {
  return receipt.serial + "/" + receipt.documentNumber;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function prepareRefund({ order, actor, original, selection, refundedQuantity, pendingTicketIds }) {
  // Authorization and state are read by the server. Cumulative quantities include
  // in-flight refunds and are read while holding the order/receipt lock.
  if (!order || order.source !== "CASHIER" || order.status !== "PAID" ||
      !actor?.shiftId || !actor.locationId || order.cashierId !== actor.id || actor.shiftId !== order.shiftId ||
      actor.locationId !== order.locationId || actor.shiftStatus !== "OPEN") {
    throw new EvotorRefundError("FORBIDDEN", "Возврат доступен по своему заказу в открытой смене.");
  }
  if (!original || original.orderId !== order.id || original.state !== "FISCALIZED" ||
      !uuidPattern.test(original.receiptId ?? "") || !validFiscalReceipt(original.receipt) ||
      !methods.has(original.paymentMethod) || typeof original.deviceId !== "string" || !original.deviceId) {
    throw new EvotorRefundError("ORIGINAL_RECEIPT_REQUIRED", "Нужен подтверждённый исходный чек Эвотора.");
  }
  if (!selection || !["TICKET", "EXTRA"].includes(selection.kind) || !positiveInteger(selection.quantity) ||
      (selection.kind === "TICKET" && selection.quantity !== 1)) {
    throw new EvotorRefundError("INVALID_SELECTION", "Выберите один билет или количество в одной позиции.");
  }
  const ticket = selection.kind === "TICKET"
    ? order.tickets.find((row) => row.publicId === selection.id && row.status === "VALID")
    : null;
  const item = ticket ?? (selection.kind === "EXTRA"
    ? order.extras.find((row) => row.id === selection.id)
    : null);
  if (!item) throw new EvotorRefundError("ITEM_NOT_REFUNDABLE", "Эту позицию нельзя вернуть.");
  if (ticket && pendingTicketIds.has(ticket.id)) {
    throw new EvotorRefundError("REFUND_PENDING", "Возврат этого билета уже ожидает подтверждения.");
  }
  const line = original.positions.find((row) => row.kind === selection.kind &&
    row.sourceId === (ticket ? ticket.orderItemId : item.id));
  if (!line || !uuidPattern.test(line.positionId ?? "") || !positiveInteger(line.quantity) ||
      !positiveInteger(line.unitPriceAmount)) {
    throw new EvotorRefundError("ORIGINAL_POSITION_REQUIRED", "Позиция не найдена в исходном чеке.");
  }
  const alreadyRefunded = refundedQuantity.get(line.positionId) ?? 0;
  const amount = line.unitPriceAmount * selection.quantity;
  if (!Number.isSafeInteger(alreadyRefunded) || alreadyRefunded < 0 ||
      alreadyRefunded + selection.quantity > line.quantity || !positiveInteger(amount)) {
    throw new EvotorRefundError("QUANTITY_UNAVAILABLE", "В исходном чеке нет такого остатка к возврату.");
  }
  return {
    orderId: order.id, deviceId: original.deviceId, originalReceiptId: original.receiptId,
    originalReceiptKey: receiptKey(original.receipt), paymentMethod: original.paymentMethod,
    ticketId: ticket?.id ?? null, extraId: ticket ? null : item.id, amount,
    positionId: line.positionId, quantity: selection.quantity,
  };
}

function verifyRefundResult(job, authenticatedDeviceId, result) {
  // Only the authenticated device assigned to a frozen job may report its outcome.
  if (!job || !result || job.deviceId !== authenticatedDeviceId ||
      result.jobId !== job.id || result.originalReceiptId !== job.originalReceiptId) {
    throw new EvotorRefundError("RESULT_MISMATCH", "Ответ кассы не соответствует заданию.");
  }
  if (result.outcome === "UNKNOWN") return { state: "RECONCILIATION_REQUIRED" };
  if (result.outcome === "DECLINED") return { state: "DECLINED" };

  const positions = result.positions;
  if (result.outcome !== "FISCALIZED" || result.settlementType !== "SALE_REFUND" ||
      result.paymentMethod !== job.paymentMethod || result.amount !== job.amount ||
      !Array.isArray(positions) || positions.length !== 1 ||
      positions[0]?.originalPositionId !== job.positionId || positions[0].quantity !== job.quantity ||
      !uuidPattern.test(result.receiptId ?? "") || result.receiptId === job.originalReceiptId ||
      !validFiscalReceipt(result.receipt) || receiptKey(result.receipt) === job.originalReceiptKey) {
    throw new EvotorRefundError("FISCAL_PROOF_MISMATCH", "Данные чека возврата требуют сверки.");
  }
  return { state: "FISCALIZED", receiptKey: receiptKey(result.receipt), receiptId: result.receiptId };
}

module.exports = { prepareRefund, verifyRefundResult };
