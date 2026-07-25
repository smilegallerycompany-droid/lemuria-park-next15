import type { DbClient } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";

export interface ExpireReservationsResult {
  expiredCount: number;
}

/**
 * Marks every PENDING reservation whose hold has expired as EXPIRED, so it
 * stops counting towards a session's booked seats.
 *
 * This is intentionally idempotent and cheap to call often: it is invoked
 * opportunistically before availability checks and before creating a new
 * reservation. In production it should ALSO be invoked on a schedule (cron /
 * scheduled Edge Function / worker) so seats free up even without incoming
 * traffic — see README for the recommended setup.
 */
export async function expireStaleReservations(
  db: DbClient,
  now: Date = new Date(),
): Promise<ExpireReservationsResult> {
  const stale = await db.reservation.findMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    select: { id: true },
  });

  if (stale.length === 0) {
    return { expiredCount: 0 };
  }

  const ids = stale.map((reservation) => reservation.id);

  await db.reservation.updateMany({
    where: { id: { in: ids } },
    data: { status: "EXPIRED" },
  });

  await Promise.all(
    ids.map((id) =>
      recordAuditLog(db, {
        action: "RESERVATION_EXPIRED",
        entityType: "Reservation",
        entityId: id,
      }),
    ),
  );

  return { expiredCount: ids.length };
}
