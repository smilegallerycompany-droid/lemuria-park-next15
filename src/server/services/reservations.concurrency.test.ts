import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createReservation } from "@/server/services/reservations";
import { createCashierSale } from "@/server/services/cashier-sales";
import { DomainError } from "@/server/domain/errors";

const prisma = new PrismaClient();

async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function seedTinySession(capacity: number) {
  const location = await prisma.location.create({
    data: {
      slug: `concurrency-test-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: "Concurrency Test Location",
      city: "Test City",
      address: "Test address",
      status: "ACTIVE",
    },
  });

  const ticketType = await prisma.ticketType.upsert({
    where: { code: "ADULT" },
    update: {},
    create: { code: "ADULT", name: "Взрослый" },
  });

  const startsAt = new Date(Date.now() + 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
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

  const session = await prisma.session.create({
    data: { locationId: location.id, startsAt, endsAt, capacity, status: "SCHEDULED" },
  });

  return { location, session, ticketType };
}

async function cleanupSession(locationId: string, sessionId: string) {
  await prisma.ticketCheckIn.deleteMany({
    where: { ticket: { sessionId } },
  });
  await prisma.ticket.deleteMany({ where: { sessionId } });
  await prisma.payment.deleteMany({ where: { order: { sessionId } } });
  await prisma.orderItem.deleteMany({ where: { order: { sessionId } } });
  await prisma.order.deleteMany({ where: { sessionId } });
  await prisma.reservationItem.deleteMany({ where: { reservation: { sessionId } } });
  await prisma.reservation.deleteMany({ where: { sessionId } });
  await prisma.session.delete({ where: { id: sessionId } });
  await prisma.priceRule.deleteMany({ where: { locationId } });
  await prisma.location.delete({ where: { id: locationId } });
}

/**
 * Two online reservations racing for the last 2 seats (capacity 2) — never oversell.
 */
test("concurrent reservations never oversell a session's remaining capacity", async (t) => {
  if (!(await isDatabaseReachable())) {
    t.skip("DATABASE_URL is not reachable");
    return;
  }

  const { location, session } = await seedTinySession(2);

  try {
    const attemptToBuyTwo = () =>
      createReservation({
        sessionPublicId: session.publicId,
        items: [{ ticketTypeCode: "ADULT", quantity: 2 }],
      });

    const [first, second] = await Promise.allSettled([attemptToBuyTwo(), attemptToBuyTwo()]);
    const fulfilled = [first, second].filter((o) => o.status === "fulfilled");
    const rejected = [first, second].filter((o) => o.status === "rejected");

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(
      rejectionReason instanceof DomainError &&
        (rejectionReason.code === "SESSION_SOLD_OUT" ||
          rejectionReason.code === "INSUFFICIENT_CAPACITY"),
    );
  } finally {
    await cleanupSession(location.id, session.id);
  }
});

/**
 * Online reservation + cashier sale racing on the last seats.
 */
test("online reservation and cashier sale never oversell last seats", async (t) => {
  if (!(await isDatabaseReachable())) {
    t.skip("DATABASE_URL is not reachable");
    return;
  }

  const { location, session } = await seedTinySession(2);
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

  try {
    const online = () =>
      createReservation({
        sessionPublicId: session.publicId,
        items: [{ ticketTypeCode: "ADULT", quantity: 2 }],
      });
    const cashierSale = () =>
      createCashierSale(
        {
          sessionPublicId: session.publicId,
          items: [{ ticketTypeCode: "ADULT", quantity: 2 }],
          paymentMethod: "CASH",
          customerName: "Race Guest",
          customerPhone: "+70000000000",
          customerEmail: "race@lemuriapark.local",
        },
        cashier.id,
      );

    const [a, b] = await Promise.allSettled([online(), cashierSale()]);
    const fulfilled = [a, b].filter((o) => o.status === "fulfilled");
    const rejected = [a, b].filter((o) => o.status === "rejected");

    assert.equal(fulfilled.length, 1, "exactly one channel should win the last seats");
    assert.equal(rejected.length, 1);

    const occupying = await prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: { order: { sessionId: session.id, status: { in: ["AWAITING_PAYMENT", "PAID"] } } },
    });
    const reserved = await prisma.reservationItem.aggregate({
      _sum: { quantity: true },
      where: {
        reservation: {
          sessionId: session.id,
          status: { in: ["PENDING", "CONFIRMED"] },
          expiresAt: { gt: new Date() },
        },
      },
    });
    const total =
      (occupying._sum.quantity ?? 0) + (reserved._sum.quantity ?? 0);
    assert.ok(total <= 2, `oversold: occupying+reserved=${total}`);
  } finally {
    await cleanupSession(location.id, session.id);
  }
});

test.after(async () => {
  await prisma.$disconnect();
});
