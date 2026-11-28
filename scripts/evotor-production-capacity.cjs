"use strict";

// Preserve online expiration while holding a cashier order until a definitive
// fiscal outcome. UNKNOWN/timeout must not release either admission of a bundle.
function pendingOrder(now) {
  return {
    status: "AWAITING_PAYMENT",
    OR: [
      { paymentExpiresAt: { gt: now } },
      { source: "CASHIER", evotorCheckout: { is: { state: { in: ["QUEUED", "CLAIMED"] } } } },
    ],
  };
}

async function heldSeats(db, sessionIds, now) {
  if (!sessionIds.length) return new Map();
  const wanted = new Set(sessionIds);
  const rows = await db.orderItem.findMany({
    where: {
      order: pendingOrder(now),
      ticketType: { countsTowardCapacity: true },
      OR: [ { order: { sessionId: { in: sessionIds } } }, { secondarySessionId: { in: sessionIds } } ],
    },
    select: { quantity: true, secondarySessionId: true, order: { select: { sessionId: true } } },
  });
  const totals = new Map();
  for (const row of rows) {
    for (const id of new Set([row.order.sessionId, row.secondarySessionId])) {
      if (id && wanted.has(id)) totals.set(id, (totals.get(id) ?? 0) + row.quantity);
    }
  }
  return totals;
}

async function aggregateOrderedQuantity(db, sessionId, now = new Date()) {
  const [held, paid] = await Promise.all([
    heldSeats(db, [sessionId], now),
    db.ticket.count({ where: { sessionId, status: { in: ["VALID", "USED"] },
      order: { status: "PAID" }, ticketType: { countsTowardCapacity: true } } }),
  ]);
  return (held.get(sessionId) ?? 0) + paid;
}

async function findOccupyingForSessions(db, sessionIds, now = new Date()) {
  if (!sessionIds.length) return [];
  const [totals, paid] = await Promise.all([
    heldSeats(db, sessionIds, now),
    db.ticket.groupBy({ by: ["sessionId"], where: { sessionId: { in: sessionIds },
      status: { in: ["VALID", "USED"] }, order: { status: "PAID" },
      ticketType: { countsTowardCapacity: true } }, _count: { _all: true } }),
  ]);
  for (const row of paid) totals.set(row.sessionId, (totals.get(row.sessionId) ?? 0) + row._count._all);
  return [...totals].map(([sessionId, quantity]) => ({ sessionId, quantity }));
}

module.exports = { pendingOrder, heldSeats, aggregateOrderedQuantity, findOccupyingForSessions };
