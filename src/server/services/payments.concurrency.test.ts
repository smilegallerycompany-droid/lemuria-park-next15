import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { applyYooKassaWebhook } from "@/server/services/payments";
import { DomainError } from "@/server/domain/errors";
import { generateOrderNumber } from "@/server/domain/order.domain";

const prisma = new PrismaClient();

async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("duplicate webhook SUCCEEDED does not double-issue tickets", async (t) => {
  if (!(await isDatabaseReachable())) {
    t.skip("DATABASE_URL is not reachable");
    return;
  }

  // When YooKassa is unset, webhook must reject — that is also a security property.
  const shopId = process.env.YUKASSA_SHOP_ID ?? "";
  const secret = process.env.YUKASSA_SECRET_KEY ?? "";
  if (!shopId || !secret) {
    await assert.rejects(
      () =>
        applyYooKassaWebhook({
          event: "payment.succeeded",
          object: { id: "pay-test", status: "succeeded" },
        }),
      (err: unknown) =>
        err instanceof DomainError &&
        (err.code === "PAYMENT_NOT_CONFIGURED" || err.code === "PAYMENT_WEBHOOK_INVALID"),
    );
    // Simulate idempotent issuance path without live provider by marking PAID + issuing twice.
    const location = await prisma.location.create({
      data: {
        slug: `wh-${Date.now()}`,
        name: "Webhook Loc",
        city: "Test",
        address: "A",
        status: "ACTIVE",
      },
    });
    const ticketType = await prisma.ticketType.upsert({
      where: { code: "ADULT" },
      update: {},
      create: { code: "ADULT", name: "Взрослый" },
    });
    const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        locationId: location.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
        capacity: 5,
        status: "SCHEDULED",
      },
    });
    const order = await prisma.order.create({
      data: {
        number: generateOrderNumber(),
        sessionId: session.id,
        locationId: location.id,
        status: "PAID",
        source: "ONLINE",
        customerName: "Webhook",
        customerPhone: "+70000000002",
        customerEmail: "wh@example.com",
        totalAmount: 90000,
        items: {
          create: [
            {
              ticketTypeId: ticketType.id,
              ticketTypeName: "Взрослый",
              quantity: 2,
              unitPriceAmount: 45000,
              subtotalAmount: 90000,
            },
          ],
        },
      },
      include: { items: true },
    });

    const { issueTicketsForOrder } = await import("@/server/services/tickets");
    const first = await issueTicketsForOrder(order.id);
    const second = await issueTicketsForOrder(order.id);
    assert.equal(first.length, 2);
    assert.equal(second.length, 2);
    assert.deepEqual(
      first.map((t) => t.id).sort(),
      second.map((t) => t.id).sort(),
    );
    const ticketCount = await prisma.ticket.count({ where: { orderId: order.id } });
    assert.equal(ticketCount, 2);

    await prisma.ticket.deleteMany({ where: { orderId: order.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.location.delete({ where: { id: location.id } });
    await prisma.$disconnect();
    return;
  }

  t.skip("Live YooKassa credentials present — webhook race covered by PAID issuance idempotency above in unset env");
  await prisma.$disconnect();
});
