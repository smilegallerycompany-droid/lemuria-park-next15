import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createReservation } from "@/server/services/reservations";
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

/**
 * End-to-end proof of the "never oversell" business rule: a session with
 * only 2 seats left, two requests racing to buy 2 seats each — exactly one
 * must win, the other must be rejected with INSUFFICIENT_CAPACITY (which the
 * public API maps to HTTP 409 — see src/lib/api/response.test.ts).
 *
 * Requires a real, reachable Postgres (DATABASE_URL). If none is available
 * (e.g. in a sandbox with no database), the test skips itself instead of
 * failing `npm test`.
 */
test("concurrent reservations never oversell a session's remaining capacity", async (t) => {
  if (!(await isDatabaseReachable())) {
    t.skip(
      "DATABASE_URL is not reachable in this environment — run against a real Postgres " +
        "(e.g. after `npx prisma migrate deploy`) to exercise this test.",
    );
    return;
  }

  const location = await prisma.location.create({
    data: {
      slug: `concurrency-test-${Date.now()}`,
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
      { locationId: location.id, ticketTypeId: ticketType.id, dayType: "WEEKDAY", priceAmount: 80000, validFrom: farPast },
      { locationId: location.id, ticketTypeId: ticketType.id, dayType: "WEEKEND", priceAmount: 90000, validFrom: farPast },
    ],
  });

  // Only 2 seats total — exactly the scenario from the spec.
  const session = await prisma.session.create({
    data: { locationId: location.id, startsAt, endsAt, capacity: 2, status: "SCHEDULED" },
  });

  try {
    const attemptToBuyTwo = () =>
      createReservation({ sessionId: session.publicId, items: [{ ticketTypeCode: "ADULT", quantity: 2 }] });

    const [first, second] = await Promise.allSettled([attemptToBuyTwo(), attemptToBuyTwo()]);

    const outcomes = [first, second];
    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");

    assert.equal(fulfilled.length, 1, "exactly one of the two concurrent buyers should succeed");
    assert.equal(rejected.length, 1, "the other concurrent buyer should be rejected");

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(
      rejectionReason instanceof DomainError && rejectionReason.code === "INSUFFICIENT_CAPACITY",
      `expected a DomainError("INSUFFICIENT_CAPACITY"), got: ${String(rejectionReason)}`,
    );
  } finally {
    await prisma.reservationItem.deleteMany({ where: { reservation: { sessionId: session.id } } });
    await prisma.reservation.deleteMany({ where: { sessionId: session.id } });
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.priceRule.deleteMany({ where: { locationId: location.id } });
    await prisma.location.delete({ where: { id: location.id } });
    await prisma.$disconnect();
  }
});
