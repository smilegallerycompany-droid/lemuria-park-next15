import type { DbClient } from "@/lib/db/prisma";
import type { ReservationLineItemInput } from "@/server/domain/reservation.domain";

export interface CreateReservationRecordInput {
  sessionId: string;
  expiresAt: Date;
  idempotencyKey?: string;
  idempotencyPayloadHash?: string;
  items: ReservationLineItemInput[];
}

/** Repository — raw Prisma data access for `Reservation`/`ReservationItem`. No business logic. */
export const reservationRepository = {
  findByIdempotencyKey(db: DbClient, idempotencyKey: string) {
    return db.reservation.findUnique({ where: { idempotencyKey }, include: { items: true } });
  },

  findByPublicId(db: DbClient, publicId: string) {
    return db.reservation.findUnique({ where: { publicId }, include: { items: true } });
  },

  /** Sum of seats currently held by active (PENDING, not yet expired) reservations for a session. */
  async aggregateReservedQuantity(db: DbClient, sessionId: string, now: Date): Promise<number> {
    const result = await db.reservationItem.aggregate({
      _sum: { quantity: true },
      where: { reservation: { sessionId, status: "PENDING", expiresAt: { gt: now } } },
    });
    return result._sum.quantity ?? 0;
  },

  /**
   * Batch equivalent of `aggregateReservedQuantity`, across many sessions at
   * once — used by the sessions-listing endpoint to avoid a per-session
   * query (N+1).
   */
  findActiveForSessions(db: DbClient, sessionIds: string[], now: Date) {
    if (sessionIds.length === 0) return Promise.resolve([]);
    return db.reservation.findMany({
      where: { sessionId: { in: sessionIds }, status: "PENDING", expiresAt: { gt: now } },
      include: { items: true },
    });
  },

  findStaleIds(db: DbClient, now: Date) {
    return db.reservation.findMany({
      where: { status: "PENDING", expiresAt: { lte: now } },
      select: { id: true },
    });
  },

  expireMany(db: DbClient, ids: string[]) {
    return db.reservation.updateMany({ where: { id: { in: ids } }, data: { status: "EXPIRED" } });
  },

  create(db: DbClient, input: CreateReservationRecordInput) {
    return db.reservation.create({
      data: {
        sessionId: input.sessionId,
        status: "PENDING",
        expiresAt: input.expiresAt,
        idempotencyKey: input.idempotencyKey,
        idempotencyPayloadHash: input.idempotencyPayloadHash,
        items: {
          create: input.items.map((item) => ({
            ticketTypeId: item.ticketTypeId,
            quantity: item.quantity,
            unitPriceAmount: item.unitPriceAmount,
          })),
        },
      },
      include: { items: true },
    });
  },

  markConfirmed(db: DbClient, id: string) {
    return db.reservation.update({ where: { id }, data: { status: "CONFIRMED" } });
  },

  markExpired(db: DbClient, id: string) {
    return db.reservation.update({
      where: { id },
      data: { status: "EXPIRED" },
      include: { items: true },
    });
  },

  /** Pessimistically locks a single Reservation row for the duration of the current transaction. */
  async lockForUpdate(tx: DbClient, reservationId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${reservationId} FOR UPDATE`;
  },
};
