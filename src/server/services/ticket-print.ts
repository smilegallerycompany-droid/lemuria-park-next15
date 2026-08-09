import { prisma } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";

export async function logTicketPrint(params: {
  orderId: string;
  actorId: string;
  ticketId?: string | null;
  source: "cashier" | "director" | "admin";
  note?: string;
}) {
  const printLog = await prisma.printLog.create({
    data: {
      orderId: params.orderId,
      ticketId: params.ticketId ?? null,
      actorId: params.actorId,
      source: params.source,
      note: params.note ?? "browser-print",
    },
  });

  await recordAuditLog(prisma, {
    actorId: params.actorId,
    action: "ORDER_PRINT",
    entityType: "Order",
    entityId: params.orderId,
    metadata: {
      printLogId: printLog.id,
      ticketId: params.ticketId,
      source: params.source,
    },
  });

  return printLog;
}

export async function getOrderPrintPayload(orderNumber: string) {
  const order = await prisma.order.findUnique({
    where: { number: orderNumber },
    include: {
      items: true,
      tickets: {
        include: { ticketType: { select: { name: true, code: true } } },
        orderBy: { createdAt: "asc" },
      },
      session: {
        include: { location: true },
      },
      location: true,
    },
  });
  if (!order) return null;

  const location = order.location ?? order.session.location;
  return {
    number: order.number,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    customerName: order.customerName,
    totalAmount: order.totalAmount,
    location: {
      name: location.name,
      city: location.city,
      address: location.address,
      phone: location.phone,
    },
    session: {
      startsAt: order.session.startsAt.toISOString(),
      endsAt: order.session.endsAt.toISOString(),
    },
    items: order.items.map((i) => ({
      ticketTypeName: i.ticketTypeName,
      quantity: i.quantity,
      unitPriceAmount: i.unitPriceAmount,
      subtotalAmount: i.subtotalAmount,
    })),
    tickets: order.tickets.map((t) => ({
      publicId: t.publicId,
      qrToken: t.qrToken,
      status: t.status,
      ticketTypeName: t.ticketType.name,
    })),
  };
}
