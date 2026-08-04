import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createCashierSale } from "@/server/services/cashier-sales";

const prisma = new PrismaClient();

async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("duplicate cashier sale idempotency key returns the same order", async (t) => {
  if (!(await isDatabaseReachable())) {
    t.skip("DATABASE_URL is not reachable");
    return;
  }

  const location = await prisma.location.create({
    data: {
      slug: `cashier-idem-${Date.now()}`,
      name: "Idempotency Loc",
      city: "Test",
      address: "Addr",
      status: "ACTIVE",
    },
  });
  const ticketType = await prisma.ticketType.upsert({
    where: { code: "ADULT" },
    update: {},
    create: { code: "ADULT", name: "Взрослый" },
  });
  const farPast = new Date("2020-01-01T00:00:00.000Z");
  await prisma.priceRule.createMany({
    data: [
      {
        locationId: location.id,
        ticketTypeId: ticketType.id,
        dayType: "WEEKDAY",
        priceAmount: 80000,
        validFrom: farPast,
      },
      {
        locationId: location.id,
        ticketTypeId: ticketType.id,
        dayType: "WEEKEND",
        priceAmount: 90000,
        validFrom: farPast,
      },
    ],
  });
  const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
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

  const key = `idem-cashier-${Date.now()}`;
  const input = {
    sessionPublicId: session.publicId,
    items: [{ ticketTypeCode: "ADULT", quantity: 1 }],
    paymentMethod: "CASH" as const,
    customerName: "Idem Guest",
    customerPhone: "+70000000001",
    customerEmail: "idem@lemuriapark.local",
  };

  try {
    const first = await createCashierSale(input, cashier.id, key);
    const second = await createCashierSale(input, cashier.id, key);
    assert.equal(first.id, second.id);
    assert.equal(first.number, second.number);

    const count = await prisma.order.count({ where: { sessionId: session.id } });
    assert.equal(count, 1);
  } finally {
    await prisma.ticket.deleteMany({ where: { sessionId: session.id } });
    await prisma.payment.deleteMany({ where: { order: { sessionId: session.id } } });
    await prisma.orderItem.deleteMany({ where: { order: { sessionId: session.id } } });
    await prisma.order.deleteMany({ where: { sessionId: session.id } });
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.priceRule.deleteMany({ where: { locationId: location.id } });
    await prisma.location.delete({ where: { id: location.id } });
    await prisma.$disconnect();
  }
});
