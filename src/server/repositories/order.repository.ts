import type { DbClient } from "@/lib/db/prisma";
import type { OrderLineItemInput } from "@/server/domain/order.domain";

export interface CreateOrderRecordInput {
  number: string;
  sessionId: string;
  reservationId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  totalAmount: number;
  paymentExpiresAt: Date;
  idempotencyKey?: string;
  idempotencyPayloadHash?: string;
  items: OrderLineItemInput[];
}

const CAPACITY_OCCUPYING_STATUSES = ["AWAITING_PAYMENT", "PAID"] as const;

/** Repository — raw Prisma data access for `Order`/`OrderItem`. No business logic. */
export const orderRepository = {
  findByNumber(db: DbClient, number: string) {
    return db.order.findUnique({ where: { number }, include: { items: true } });
  },

  findByIdempotencyKey(db: DbClient, idempotencyKey: string) {
    return db.order.findUnique({ where: { idempotencyKey }, include: { items: true } });
  },

  findByReservationId(db: DbClient, reservationId: string) {
    return db.order.findUnique({ where: { reservationId }, include: { items: true } });
  },

  /** Sum of seats currently held by orders awaiting payment or already paid, for a session. */
  async aggregateOrderedQuantity(db: DbClient, sessionId: string): Promise<number> {
    const result = await db.orderItem.aggregate({
      _sum: { quantity: true },
      where: { order: { sessionId, status: { in: [...CAPACITY_OCCUPYING_STATUSES] } } },
    });
    return result._sum.quantity ?? 0;
  },

  /**
   * Batch equivalent of `aggregateOrderedQuantity`, across many sessions at
   * once — used by the sessions-listing endpoint to avoid a per-session
   * query (N+1).
   */
  findOccupyingForSessions(db: DbClient, sessionIds: string[]) {
    if (sessionIds.length === 0) return Promise.resolve([]);
    return db.order.findMany({
      where: { sessionId: { in: sessionIds }, status: { in: [...CAPACITY_OCCUPYING_STATUSES] } },
      include: { items: true },
    });
  },

  findStaleAwaitingPaymentIds(db: DbClient, now: Date) {
    return db.order.findMany({
      where: { status: "AWAITING_PAYMENT", paymentExpiresAt: { lte: now } },
      select: { id: true },
    });
  },

  expireMany(db: DbClient, ids: string[]) {
    return db.order.updateMany({ where: { id: { in: ids } }, data: { status: "EXPIRED" } });
  },

  create(db: DbClient, input: CreateOrderRecordInput) {
    return db.order.create({
      data: {
        number: input.number,
        sessionId: input.sessionId,
        reservationId: input.reservationId,
        status: "AWAITING_PAYMENT",
        source: "ONLINE",
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        totalAmount: input.totalAmount,
        paymentExpiresAt: input.paymentExpiresAt,
        idempotencyKey: input.idempotencyKey,
        idempotencyPayloadHash: input.idempotencyPayloadHash,
        items: {
          create: input.items.map((item) => ({
            ticketTypeId: item.ticketTypeId,
            ticketTypeName: item.ticketTypeName,
            quantity: item.quantity,
            unitPriceAmount: item.unitPriceAmount,
            subtotalAmount: item.subtotalAmount,
          })),
        },
      },
      include: { items: true },
    });
  },
};
