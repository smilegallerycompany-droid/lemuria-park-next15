import type { DbClient } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { orderRepository } from "@/server/repositories/order.repository";

export interface ExpirePaymentOrdersResult {
  expiredCount: number;
}

/**
 * OrderCleanupService — marks every AWAITING_PAYMENT order whose own
 * `paymentExpiresAt` deadline has passed as EXPIRED, so it stops occupying
 * seats. Independent from ReservationCleanupService: once an Order exists,
 * the originating Reservation's `expiresAt` no longer matters — only the
 * Order's own payment window does.
 *
 * Intentionally idempotent and cheap to call often: invoked
 * opportunistically before availability checks. In production it should
 * ALSO run on a schedule (cron / worker) so seats free up without incoming
 * traffic.
 */
export async function expireStalePaymentOrders(
  db: DbClient,
  now: Date = new Date(),
): Promise<ExpirePaymentOrdersResult> {
  const stale = await orderRepository.findStaleAwaitingPaymentIds(db, now);
  if (stale.length === 0) {
    return { expiredCount: 0 };
  }

  const ids = stale.map((order) => order.id);
  await orderRepository.expireMany(db, ids);

  await Promise.all(
    ids.map((id) =>
      recordAuditLog(db, {
        action: "ORDER_PAYMENT_EXPIRED",
        entityType: "Order",
        entityId: id,
      }),
    ),
  );

  return { expiredCount: ids.length };
}
