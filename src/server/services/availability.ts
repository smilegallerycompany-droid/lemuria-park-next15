import type { DbClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/response";

export interface SessionAvailability {
  sessionId: string;
  capacity: number;
  /** Seats currently held by active reservations + confirmed/awaiting orders. */
  booked: number;
  available: number;
}

/**
 * Computes remaining seats for a session by summing every seat currently
 * held — by both online reservations/orders AND cashier walk-up orders — so
 * total capacity is always respected regardless of sales channel.
 *
 * Expired reservations never count towards `booked` (their `expiresAt` is in
 * the past), so callers don't strictly need to run cleanup first, though
 * running `expireStaleReservations` periodically keeps the data tidy.
 *
 * IMPORTANT: when used to guard a seat-limited write (e.g. creating a new
 * reservation), call this from *inside* a `prisma.$transaction` with
 * `Serializable` isolation so the read-then-write is race-safe.
 */
export async function getSessionAvailability(
  db: DbClient,
  sessionId: string,
  now: Date = new Date(),
): Promise<SessionAvailability> {
  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new ApiError("NOT_FOUND", "Сеанс не найден", 404);
  }

  const [reservedAgg, orderedAgg] = await Promise.all([
    db.reservationItem.aggregate({
      _sum: { quantity: true },
      where: {
        reservation: {
          sessionId,
          status: "PENDING",
          expiresAt: { gt: now },
        },
      },
    }),
    db.orderItem.aggregate({
      _sum: { quantity: true },
      where: {
        order: {
          sessionId,
          status: { in: ["AWAITING_PAYMENT", "PAID"] },
        },
      },
    }),
  ]);

  const booked = (reservedAgg._sum.quantity ?? 0) + (orderedAgg._sum.quantity ?? 0);

  return {
    sessionId,
    capacity: session.capacity,
    booked,
    available: Math.max(0, session.capacity - booked),
  };
}
