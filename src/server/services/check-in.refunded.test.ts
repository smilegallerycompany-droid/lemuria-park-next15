import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { checkInTicket } from "@/server/services/check-in";
import { generateOrderNumber } from "@/server/domain/order.domain";
import { formatDateInTimezone } from "@/lib/datetime";

const prisma = new PrismaClient();

async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("scanning a refunded ticket persists CheckInResult.REFUNDED", async (t) => {
  if (!(await isDatabaseReachable())) {
    t.skip("DATABASE_URL is not reachable");
    return;
  }

  const location = await prisma.location.create({
    data: {
      slug: `checkin-refunded-${Date.now()}`,
      name: "Refunded Checkin Loc",
      city: "Test",
      address: "A",
      status: "ACTIVE",
      timezone: "Europe/Moscow",
    },
  });
  const ticketType = await prisma.ticketType.upsert({
    where: { code: "ADULT" },
    update: {},
    create: { code: "ADULT", name: "Взрослый" },
  });

  const tz = "Europe/Moscow";
  const today = formatDateInTimezone(new Date(), tz);
  const startsAt = new Date(`${today}T15:00:00+03:00`);
  const session = await prisma.session.create({
    data: {
      locationId: location.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
      capacity: 10,
      status: "SCHEDULED",
    },
  });

  const cashier = await prisma.user.upsert({
    where: { email: "cashier@lemuriapark.ru" },
    update: {},
    create: {
      email: "cashier@lemuriapark.ru",
      name: "Кассир",
      passwordHash: "x",
      role: "CASHIER",
      status: "ACTIVE",
    },
  });

  const order = await prisma.order.create({
    data: {
      number: generateOrderNumber(),
      sessionId: session.id,
      locationId: location.id,
      status: "REFUNDED",
      source: "CASHIER",
      customerName: "E2E / STAGING refunded scan",
      customerPhone: "+70000000013",
      customerEmail: "refunded-scan@example.com",
      totalAmount: 90000,
      cashierId: cashier.id,
      items: {
        create: [
          {
            ticketTypeId: ticketType.id,
            ticketTypeName: "Взрослый",
            quantity: 1,
            unitPriceAmount: 90000,
            subtotalAmount: 90000,
          },
        ],
      },
    },
    include: { items: true },
  });

  const qrToken = randomBytes(24).toString("base64url");
  const ticket = await prisma.ticket.create({
    data: {
      orderId: order.id,
      orderItemId: order.items[0]!.id,
      sessionId: session.id,
      ticketTypeId: ticketType.id,
      status: "REFUNDED",
      qrToken,
    },
  });

  try {
    const response = await checkInTicket({ qrToken, cashierId: cashier.id });
    assert.equal(response.result, "REFUNDED");

    const logs = await prisma.ticketCheckIn.findMany({
      where: { ticketId: ticket.id },
      orderBy: { scannedAt: "desc" },
    });
    assert.equal(logs.length, 1);
    assert.equal(logs[0]!.result, "REFUNDED");
    assert.notEqual(logs[0]!.result, "CANCELLED");
  } finally {
    await prisma.ticketCheckIn.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.ticket.delete({ where: { id: ticket.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.location.delete({ where: { id: location.id } });
    await prisma.$disconnect();
  }
});
