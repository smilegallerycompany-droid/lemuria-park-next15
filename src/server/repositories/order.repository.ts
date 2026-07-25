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
  idempotencyKey?: string;
  items: OrderLineItemInput[];
}

/** Repository — raw Prisma data access for `Order`/`OrderItem`. No business logic. */
export const orderRepository = {
  findByNumber(db: DbClient, number: string) {
    return db.order.findUnique({ where: { number }, include: { items: true } });
  },

  findByIdempotencyKey(db: DbClient, idempotencyKey: string) {
    return db.order.findUnique({ where: { idempotencyKey }, include: { items: true } });
  },

  findByReservationId(db: DbClient, reservationId: string) {
    return db.order.findUnique({ where: { reservationId } });
  },

  /** Sum of seats currently held by orders awaiting payment or already paid, for a session. */
  async aggregateOrderedQuantity(db: DbClient, sessionId: string): Promise<number> {
    const result = await db.orderItem.aggregate({
      _sum: { quantity: true },
      where: { order: { sessionId, status: { in: ["AWAITING_PAYMENT", "PAID"] } } },
    });
    return result._sum.quantity ?? 0;
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
        idempotencyKey: input.idempotencyKey,
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
