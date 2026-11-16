"use strict";

const { createHash } = require("node:crypto");

const action = "CASHIER_TICKET_CORRECTED";
const oppositeCode = { ADULT: "CHILD", CHILD: "ADULT" };
const referencePattern = /^[0-9]{16}\/[0-9]{1,10}$/;

function conflict(ApiError) {
  return new ApiError("IDEMPOTENCY_CONFLICT", "Заказ изменился. Откройте его снова и проверьте суммы.", 409);
}

function eligibleOrder(order, actor, scoped) {
  return Boolean(order && scoped && order.cashierId === actor.id && order.source === "CASHIER" &&
    order.status === "PAID" && order.shift?.status === "OPEN" &&
    order.shift.userId === actor.id && order.shift.locationId === order.session.locationId &&
    order.payments.length === 1 && order.payments[0].status === "SUCCEEDED" &&
    ["CASH", "CARD_TERMINAL"].includes(order.payments[0].method) &&
    !order.payments[0].providerPaymentId && order.totalAmount === order.payments[0].amount &&
    order.refunds.length === 0);
}

function eligibleTicket(ticket, order) {
  return ticket && ticket.sessionId === order.sessionId && ["VALID", "USED"].includes(ticket.status) &&
    Object.hasOwn(oppositeCode, ticket.ticketType.code) &&
    ticket.orderItem.ticketTypeId === ticket.ticketTypeId &&
    Number.isSafeInteger(ticket.orderItem.unitPriceAmount) && ticket.orderItem.unitPriceAmount > 0;
}

async function loadOrder(db, number) {
  return db.order.findUnique({
    where: { number },
    include: {
      items: true, payments: true, shift: true,
      refunds: { select: { id: true }, take: 1 },
      session: { include: { location: true } },
      tickets: { include: { ticketType: { select: { code: true } }, orderItem: true } },
    },
  });
}

async function buildPreview(db, order, ticket, { ApiError, resolvePrice }) {
  const code = oppositeCode[ticket.ticketType.code];
  const type = await db.ticketType.findUnique({
    where: { code },
    select: { id: true, name: true, isActive: true, availableAtCashier: true, isTwoParkBundle: true },
  });
  if (!type?.isActive || !type.availableAtCashier || type.isTwoParkBundle) {
    throw new ApiError("INVALID_TICKET_TYPE", "Новый тариф сейчас недоступен в кассе.", 409);
  }
  const old = ticket.orderItem;
  const existing = order.items.find((item) => item.ticketTypeId === type.id);
  const price = existing?.unitPriceAmount ?? (await resolvePrice(db, {
    locationId: order.session.locationId, ticketTypeId: type.id, park: order.session.park,
    timezone: order.session.location.timezone, atDate: order.session.startsAt,
  })).unitPriceAmount;
  if (old.quantity < 1 || old.subtotalAmount !== old.quantity * old.unitPriceAmount ||
      !Number.isSafeInteger(price) || price <= 0 ||
      (existing && existing.subtotalAmount !== existing.quantity * price)) {
    throw new ApiError("INVALID_TICKET_TYPE", "Тариф в заказе требует проверки управляющим.", 409);
  }
  const delta = price - old.unitPriceAmount;
  const version = createHash("sha256").update(JSON.stringify([
    order.id, order.updatedAt, order.payments[0].updatedAt, ticket.id, ticket.updatedAt, old.id, old.updatedAt,
    existing?.id, existing?.updatedAt, type.id, price, delta,
  ])).digest("hex");
  return { type, old, existing, delta, price, version };
}

async function exchange(db, { actor, number, body }, deps) {
  const { ApiError, assertScope, lockActor, lockShift } = deps;
  if (!body || !["preview", "confirm"].includes(body.action) ||
      typeof body.ticketId !== "string" || !/^[\w-]{1,128}$/.test(body.ticketId)) {
    throw new ApiError("VALIDATION_ERROR", "Выберите билет для исправления.", 400);
  }

  if (body.action === "preview") {
    const order = await loadOrder(db, number);
    if (!eligibleOrder(order, actor, order && deps.canAccess(actor, order.session.locationId))) {
      throw new ApiError("FORBIDDEN", "Исправление доступно для своего заказа в открытой смене.", 403);
    }
    await assertScope(db, actor.id, order.session.locationId);
    const ticket = order.tickets.find((row) => row.publicId === body.ticketId);
    if (!eligibleTicket(ticket, order)) {
      throw new ApiError("INVALID_TICKET_TYPE", "Этот билет нельзя заменить в кассе.", 409);
    }
    const { type, old, price, delta, version } = await buildPreview(db, order, ticket, deps);
    return { version, before: old.ticketTypeName, after: type.name, oldAmount: old.unitPriceAmount,
      newAmount: price, delta, paymentMethod: order.payments[0].method };
  }

  if (!/^[a-f0-9]{64}$/.test(body.version || "") ||
      typeof body.originalDocument !== "string" || !referencePattern.test(body.originalDocument) ||
      typeof body.correctionDocument !== "string" || !referencePattern.test(body.correctionDocument) ||
      body.originalDocument === body.correctionDocument || body.settled !== true) {
    throw new ApiError("VALIDATION_ERROR", "Укажите ФН/ФД обоих чеков и подтвердите расчёт.", 400);
  }

  return db.$transaction(async (tx) => {
    await lockActor(tx, actor.id);
    const initial = await tx.order.findUnique({ where: { number }, select: { id: true, cashierId: true, shiftId: true } });
    if (!initial?.shiftId || initial.cashierId !== actor.id) {
      throw new ApiError("NOT_FOUND", "Заказ не найден.", 404);
    }
    await lockShift(tx, initial.shiftId);
    const order = await loadOrder(tx, number);
    await assertScope(tx, actor.id, order.session.locationId);
    const ticket = order.tickets.find((row) => row.publicId === body.ticketId);
    const auditId = "ticket-correction:" + body.correctionDocument;
    const registered = await tx.auditLog.findUnique({ where: { id: auditId } });
    if (registered) {
      if (registered.action === action && registered.actorId === actor.id && registered.entityId === order.id &&
          registered.metadata?.ticketId === ticket?.id && registered.metadata.version === body.version &&
          registered.metadata.originalDocument === body.originalDocument) return registered.after;
      throw new ApiError("IDEMPOTENCY_CONFLICT", "Этот чек исправления уже указан в CRM.", 409);
    }
    if (!eligibleOrder(order, actor, deps.canAccess(actor, order.session.locationId)) ||
        !eligibleTicket(ticket, order)) throw conflict(ApiError);
    const { type, old, existing, delta, price, version } = await buildPreview(tx, order, ticket, deps);
    if (body.version !== version) throw conflict(ApiError);

    const payment = order.payments[0];
    const before = { ticketTypeName: old.ticketTypeName, unitPriceAmount: old.unitPriceAmount,
      totalAmount: order.totalAmount, paymentAmount: payment.amount, paymentId: payment.id,
      orderItemId: old.id, quantity: old.quantity };
    const totalAmount = order.totalAmount + delta;
    let targetItem = existing;
    if (old.quantity === 1 && !existing) {
      targetItem = await tx.orderItem.update({
        where: { id: old.id },
        data: { ticketTypeId: type.id, ticketTypeName: type.name, unitPriceAmount: price, subtotalAmount: price },
      });
    } else {
      if (existing) {
        await tx.orderItem.update({
          where: { id: existing.id },
          data: { quantity: { increment: 1 }, subtotalAmount: { increment: price } },
        });
      } else {
        targetItem = await tx.orderItem.create({ data: {
          orderId: order.id, ticketTypeId: type.id, ticketTypeName: type.name,
          quantity: 1, unitPriceAmount: price, subtotalAmount: price,
        } });
      }
    }
    const changed = await tx.ticket.updateMany({
      where: { id: ticket.id, orderItemId: old.id, status: { in: ["VALID", "USED"] } },
      data: { orderItemId: targetItem.id, ticketTypeId: type.id },
    });
    if (changed.count !== 1) throw conflict(ApiError);
    if (targetItem.id !== old.id) {
      if (old.quantity === 1) await tx.orderItem.delete({ where: { id: old.id } });
      else await tx.orderItem.update({ where: { id: old.id },
        data: { quantity: { decrement: 1 }, subtotalAmount: { decrement: old.unitPriceAmount } } });
    }

    if (delta !== 0) {
      await tx.payment.update({ where: { id: payment.id }, data: { amount: totalAmount } });
      await tx.order.update({ where: { id: order.id }, data: { totalAmount } });
      const cash = payment.method === "CASH";
      await tx.cashierShift.update({ where: { id: order.shiftId },
        data: { [cash ? "cashSalesAmount" : "cardSalesAmount"]: { increment: delta } } });
      if (cash) await tx.cashOperation.create({ data: {
        type: "SALE", amount: delta, userId: actor.id, shiftId: order.shiftId,
        orderId: order.id, comment: "Исправление типа билета",
      } });
    }
    const after = { ticketTypeName: type.name, unitPriceAmount: price, totalAmount, delta };
    await tx.auditLog.create({ data: {
      id: auditId, actorId: actor.id, action, entityType: "Order", entityId: order.id,
      before,
      after,
      metadata: { version, ticketId: ticket.id, orderNumber: number, originalDocument: body.originalDocument,
        correctionDocument: body.correctionDocument, method: payment.method },
    } });
    return after;
  }, { isolationLevel: "Serializable" });
}

module.exports = { exchange, eligibleOrder };
