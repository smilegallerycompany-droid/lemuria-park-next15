import { prisma } from "@/lib/db/prisma";
import { isPrismaServerClosed } from "@/lib/db/prisma-disconnect";
import { expireStalePaymentOrders } from "@/server/services/order-cleanup";
import { expireStaleReservations } from "@/server/services/reservation-cleanup";

export type ScheduledCleanupResult = {
  reservationsExpired: number;
  ordersExpired: number;
};

export type ScheduledCleanupDeps = {
  expireReservations: typeof expireStaleReservations;
  expireOrders: typeof expireStalePaymentOrders;
  recordOk: (result: ScheduledCleanupResult) => Promise<void>;
  recordError: () => Promise<void>;
  reconnect: () => Promise<void>;
};

async function defaultRecordOk(result: ScheduledCleanupResult): Promise<void> {
  await prisma.operationalEvent.create({
    data: {
      kind: "CRON_CLEANUP",
      status: "OK",
      message: "scheduled cleanup",
      metadata: result,
    },
  });
}

async function defaultRecordError(): Promise<void> {
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
}

async function defaultReconnect(): Promise<void> {
  await prisma.$disconnect();
  await prisma.$connect();
}

/**
 * Timer-trigger entry: expire stale holds even when there is no guest traffic.
 * Writes OperationalEvent CRON_CLEANUP for owner/director health (no PII).
 *
 * Idempotent. A single reconnect+retry is allowed only for Prisma P1017
 * (Yandex pooler closed an idle Serverless socket). Other errors are not retried.
 */
export async function runScheduledCleanup(
  now: Date = new Date(),
  deps: ScheduledCleanupDeps = {
    expireReservations: expireStaleReservations,
    expireOrders: expireStalePaymentOrders,
    recordOk: defaultRecordOk,
    recordError: defaultRecordError,
    reconnect: defaultReconnect,
  },
): Promise<ScheduledCleanupResult> {
  try {
    return await runCleanupOnce(now, deps);
  } catch (error) {
    if (!isPrismaServerClosed(error)) {
      await deps.recordError();
      throw error;
    }
    await deps.reconnect();
    try {
      return await runCleanupOnce(now, deps);
    } catch (retryError) {
      await deps.recordError();
      throw retryError;
    }
  }
}

async function runCleanupOnce(
  now: Date,
  deps: ScheduledCleanupDeps,
): Promise<ScheduledCleanupResult> {
  const [reservations, orders] = await Promise.all([
    deps.expireReservations(prisma, now),
    deps.expireOrders(prisma, now),
  ]);
  const result: ScheduledCleanupResult = {
    reservationsExpired: reservations.expiredCount,
    ordersExpired: orders.expiredCount,
  };
  await deps.recordOk(result);
  return result;
}
