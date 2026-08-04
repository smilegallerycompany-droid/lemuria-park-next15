import { randomBytes } from "node:crypto";
import type { Ticket } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { DomainError } from "@/server/domain/errors";

function generateQrToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Idempotent ticket issuance — only for PAID orders.
 * Re-running returns existing tickets without creating duplicates.
 */
export async function issueTicketsForOrder(
  orderId: string,
  db: DbClient = prisma,
): Promise<Ticket[]> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, tickets: true },
  });

  if (!order) {
    throw new DomainError("ORDER_NOT_FOUND", "Заказ не найден");
  }
  if (order.status !== "PAID") {
    throw new DomainError("ORDER_NOT_PAID", "Билеты выпускаются только для оплаченных заказов");
  }

  if (order.tickets.length > 0) {
    return order.tickets;
  }

  const created: Ticket[] = [];

  for (const item of order.items) {
    for (let i = 0; i < item.quantity; i += 1) {
      const ticket = await db.ticket.create({
        data: {
          orderId: order.id,
          orderItemId: item.id,
          sessionId: order.sessionId,
          ticketTypeId: item.ticketTypeId,
          status: "VALID",
          qrToken: generateQrToken(),
        },
      });
      created.push(ticket);
    }
  }

  await recordAuditLog(db, {
    action: "TICKETS_ISSUED",
    entityType: "Order",
    entityId: order.id,
    metadata: { count: created.length },
  });

  return created;
}
