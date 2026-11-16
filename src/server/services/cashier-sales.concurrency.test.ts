import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { DomainError } from "@/server/domain/errors";
import { listCashierSessionsForToday } from "@/server/services/cashier-workspace";
import { createCashierSale } from "@/server/services/cashier-sales";
import { listPublicSessions } from "@/server/services/session-listing";

const prisma = new PrismaClient();

async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("a late cashier sale succeeds once and new sales stop at the end", async (t) => {
  if (!(await isDatabaseReachable())) {
    t.skip("DATABASE_URL is not reachable");
    return;
  }

  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-16T07:25:00Z") });
  const location = await prisma.location.create({
    data: {
      slug: `cashier-idem-${Date.now()}`,
      name: "Idempotency Loc",
      city: "Test",
      address: "Addr",
      status: "ACTIVE",
      timezone: "Europe/Saratov",
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
  const startsAt = new Date("2026-11-16T07:30:00Z");
  const endsAt = new Date("2026-11-16T07:50:00Z");
  const session = await prisma.session.create({
    data: {
      locationId: location.id,
      startsAt,
      endsAt,
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

  await prisma.cashierShift.updateMany({
    where: { userId: cashier.id, status: "OPEN" },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  await prisma.cashierShift.create({
    data: {
      userId: cashier.id,
      locationId: location.id,
      openingCashAmount: 0,
      status: "OPEN",
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
    await prisma.order.create({
      data: {
        number: `${key}-online`,
        sessionId: session.id,
        locationId: location.id,
        status: "PAID",
        source: "ONLINE",
        customerName: "Online Guest",
        customerPhone: "+70000000002",
        customerEmail: "online@lemuriapark.local",
        totalAmount: 160000,
        items: {
          create: {
            ticketTypeId: ticketType.id,
            ticketTypeName: ticketType.name,
            quantity: 2,
            unitPriceAmount: 80000,
            subtotalAmount: 160000,
          },
        },
      },
    });
    const website = await listPublicSessions({ locationSlug: location.slug, date: "2026-11-16" });
    assert.equal(website.sessions.find((item) => item.publicId === session.publicId)?.remainingSeats, 8);

    t.mock.timers.setTime(new Date("2026-11-16T07:32:00Z").getTime());
    const before = await listCashierSessionsForToday(location.id);
    assert.equal(before.sessions.find((item) => item.publicId === session.publicId)?.remaining, 8);

    const first = await createCashierSale(input, cashier.id, key);
    const after = await listCashierSessionsForToday(location.id);
    assert.equal(after.sessions.find((item) => item.publicId === session.publicId)?.remaining, 7);

    t.mock.timers.setTime(endsAt.getTime());
    const ended = await listCashierSessionsForToday(location.id);
    assert.equal(ended.sessions.some((item) => item.publicId === session.publicId), false);
    await assert.rejects(
      () => createCashierSale(input, cashier.id, `${key}-new`),
      (error: unknown) => error instanceof DomainError && error.code === "SESSION_NOT_AVAILABLE",
    );
    const second = await createCashierSale(input, cashier.id, key);
    assert.equal(first.id, second.id);
    assert.equal(first.number, second.number);

    const count = await prisma.order.count({ where: { sessionId: session.id, source: "CASHIER" } });
    assert.equal(count, 1);
  } finally {
    await prisma.ticket.deleteMany({ where: { sessionId: session.id } });
    await prisma.payment.deleteMany({ where: { order: { sessionId: session.id } } });
    await prisma.orderItem.deleteMany({ where: { order: { sessionId: session.id } } });
    await prisma.cashOperation.deleteMany({ where: { shift: { locationId: location.id } } });
    await prisma.order.deleteMany({ where: { sessionId: session.id } });
    await prisma.cashierShift.deleteMany({ where: { locationId: location.id } });
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.priceRule.deleteMany({ where: { locationId: location.id } });
    await prisma.location.delete({ where: { id: location.id } });
    await prisma.$disconnect();
  }
});
