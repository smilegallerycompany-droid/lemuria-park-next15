import type { DbClient } from "@/lib/db/prisma";
import type { ReservationLineItemInput } from "@/server/domain/reservation.domain";

export interface CreateReservationRecordInput {
  sessionId: string;
  expiresAt: Date;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  idempotencyKey?: string;
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

  /** Same as `findByPublicId` but also tells the caller whether an Order already exists for it. */
  findByPublicIdWithOrderFlag(db: DbClient, publicId: string) {
    return db.reservation.findUnique({
      where: { publicId },
      include: { items: true, order: { select: { id: true } } },
    });
  },

  /** Sum of seats currently held by active (PENDING, not yet expired) reservations for a session. */
  async aggregateReservedQuantity(db: DbClient, sessionId: string, now: Date): Promise<number> {
    const result = await db.reservationItem.aggregate({
      _sum: { quantity: true },
      where: { reservation: { sessionId, status: "PENDING", expiresAt: { gt: now } } },
    });
    return result._sum.quantity ?? 0;
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
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        idempotencyKey: input.idempotencyKey,
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
};
