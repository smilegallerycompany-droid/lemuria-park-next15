import { prisma } from "@/lib/db/prisma";
import { expireStalePaymentOrders } from "@/server/services/order-cleanup";
import { expireStaleReservations } from "@/server/services/reservation-cleanup";

export type ScheduledCleanupResult = {
  reservationsExpired: number;
  ordersExpired: number;
};

/**
 * Timer-trigger entry: expire stale holds even when there is no guest traffic.
 * Writes OperationalEvent CRON_CLEANUP for owner/director health (no PII).
 */
export async function runScheduledCleanup(
  now: Date = new Date(),
): Promise<ScheduledCleanupResult> {
  try {
    const [reservations, orders] = await Promise.all([
      expireStaleReservations(prisma, now),
      expireStalePaymentOrders(prisma, now),
    ]);
    const result: ScheduledCleanupResult = {
      reservationsExpired: reservations.expiredCount,
      ordersExpired: orders.expiredCount,
    };
    await prisma.operationalEvent.create({
      data: {
        kind: "CRON_CLEANUP",
        status: "OK",
        message: "scheduled cleanup",
        metadata: result,
      },
    });
    return result;
  } catch (error) {
    try {
      await prisma.operationalEvent.create({
        data: {
          kind: "CRON_CLEANUP",
          status: "ERROR",
          message: "scheduled cleanup failed",
        },
      });
    } catch {
      // Health already missing; do not mask the original failure.
    }
    throw error;
  }
}
