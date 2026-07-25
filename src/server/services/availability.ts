import type { DbClient } from "@/lib/db/prisma";
import { DomainError } from "@/server/domain/errors";
import { computeAvailability, type SessionAvailability } from "@/server/domain/availability.domain";
import { sessionRepository } from "@/server/repositories/session.repository";
import { reservationRepository } from "@/server/repositories/reservation.repository";
import { orderRepository } from "@/server/repositories/order.repository";

export type { SessionAvailability };

/**
 * AvailabilityService — orchestrates Repository (fetch the session +
 * aggregate seats already held) and Domain (compute the remaining seats).
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
  const session = await sessionRepository.findById(db, sessionId);
  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "Сеанс не найден");
  }

  const [reservedQuantity, orderedQuantity] = await Promise.all([
    reservationRepository.aggregateReservedQuantity(db, sessionId, now),
    orderRepository.aggregateOrderedQuantity(db, sessionId),
  ]);

  return computeAvailability({
    sessionId,
    capacity: session.capacity,
    reservedQuantity,
    orderedQuantity,
  });
}
