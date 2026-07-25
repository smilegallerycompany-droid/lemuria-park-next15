import type { DbClient } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { reservationRepository } from "@/server/repositories/reservation.repository";

export interface ExpireReservationsResult {
  expiredCount: number;
}

/**
 * ReservationCleanupService — marks every PENDING reservation whose hold has
 * expired as EXPIRED, so it stops counting towards a session's booked seats.
 *
 * This is intentionally idempotent and cheap to call often: it is invoked
 * opportunistically before availability checks and before creating a new
 * reservation/order. In production it should ALSO be invoked on a schedule
 * (cron / scheduled Edge Function / worker) so seats free up even without
 * incoming traffic — see README for the recommended setup.
 */
export async function expireStaleReservations(
  db: DbClient,
  now: Date = new Date(),
): Promise<ExpireReservationsResult> {
  const stale = await reservationRepository.findStaleIds(db, now);
  if (stale.length === 0) {
    return { expiredCount: 0 };
  }

  const ids = stale.map((reservation) => reservation.id);
  await reservationRepository.expireMany(db, ids);

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
