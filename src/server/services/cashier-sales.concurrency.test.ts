import { test } from "node:test";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { DomainError } from "@/server/domain/errors";
import { listCashierSessionsForToday } from "@/server/services/cashier-workspace";
import { createCashierSale } from "@/server/services/cashier-sales";
import { listPublicSessions } from "@/server/services/session-listing";

import { handleTerminalRequest } from "./evotor-checkout";
import { closeCashierShift } from "./cashier-shifts";

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
  if (process.env.RUN_DATABASE_TESTS !== "1") {
    t.skip("Set RUN_DATABASE_TESTS=1 only for an isolated migrated test database");
    return;
  }
  if (!(await isDatabaseReachable())) {
    t.skip("DATABASE_URL is not reachable");
    return;
  }

  const fixtureId = randomUUID();
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-16T07:25:00Z") });
  const location = await prisma.location.create({
    data: {
      slug: `cashier-idem-${fixtureId}`,
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
  const cashier = await prisma.user.create({
    data: {
      email: `cashier-${fixtureId}@example.invalid`,
      name: "Кассир",
      passwordHash: "x",
      role: "CASHIER",
      status: "ACTIVE",
    },
  });

  const shift = await prisma.cashierShift.create({
    data: {
      userId: cashier.id,
      locationId: location.id,
      openingCashAmount: 0,
      status: "OPEN",
    },
  });

  const previousTerminals = process.env.EVOTOR_TERMINALS_JSON;
  process.env.EVOTOR_TERMINALS_JSON = JSON.stringify([{ id: `test-${fixtureId}`, locationId: location.id, tokenHash: "0".repeat(64) }]);
  const key = `idem-cashier-${fixtureId}`;
  const input = {
    sessionPublicId: session.publicId,
    items: [{ ticketTypeCode: "ADULT", quantity: 1 }],
    paymentMethod: "CASH" as const,
    cashReceived: 100000,
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
    assert.equal(first.status, "AWAITING_PAYMENT");
    assert.equal(await prisma.ticket.count({ where: { orderId: first.id } }), 0);
    const checkout = await prisma.evotorCheckout.findUniqueOrThrow({ where: { orderId: first.id } });
    assert.equal(checkout.cashReceived, 100000);
    assert.equal(checkout.changeAmount, 20000);
    assert.deepEqual(checkout.receiptPayload, {version:1,totalAmount:80000,
      items:[{code:ticketType.code,quantity:1,amount:80000}]});
    const after = await listCashierSessionsForToday(location.id);
    assert.equal(after.sessions.find((item) => item.publicId === session.publicId)?.remaining, 7);

    const terminal = {id: `test-${fixtureId}`, locationId: location.id};
    await assert.rejects(closeCashierShift({userId: cashier.id, shiftId: shift.id, closingCashAmount: 0}),
      (error: unknown) => error instanceof DomainError && error.code === "INVALID_STATUS_TRANSITION");
    const nonces = [randomUUID(), randomUUID()];
    const claims = await Promise.all(nonces.map(claimId => handleTerminalRequest(terminal, {action: "claim", claimId})));
    const winner = claims.findIndex(r => "sale" in r && r.sale !== null);
    assert.notEqual(winner, -1);
    assert.equal(claims.filter(r => "sale" in r && r.sale !== null).length, 1);
    const recovered = await handleTerminalRequest(terminal, {action: "claim", claimId: nonces[winner]});
    assert.equal("sale" in recovered && recovered.sale?.id, checkout.id);
    await prisma.ticketType.update({where:{id:ticketType.id},data:{code:ticketType.code+"-changed"}});
    const stable = await handleTerminalRequest(terminal, {action:"claim",claimId:nonces[winner]});
    assert.equal("sale" in stable && stable.sale?.items[0].code,ticketType.code);
    await prisma.ticketType.update({where:{id:ticketType.id},data:{code:ticketType.code}});
    const proof = {requestId: checkout.id, outcome: "FISCALIZED", amount: 80000, paymentMethod: "CASH",
      receipt: {serial: "1234567890123456", documentNumber: "123", fiscalSign: "12345"}};
    await Promise.all(Array.from({length: 6}, () => handleTerminalRequest(terminal, {action: "result", result: proof})));
    assert.equal(await prisma.ticket.count({where: {orderId: first.id}}), 1);
    assert.equal(await prisma.cashOperation.count({where: {orderId: first.id, type: "SALE"}}), 1);
    let ledger = await prisma.cashierShift.findUniqueOrThrow({where: {id: shift.id}});
    assert.equal(ledger.cashSalesAmount, 80000);
    assert.equal(ledger.cardSalesAmount, 0);
    assert.equal(ledger.onlineSalesAmount, 0);
    const card = await createCashierSale({...input, paymentMethod: "CARD_TERMINAL", cashReceived: undefined}, cashier.id, key+"-card");
    const completedClaim = await handleTerminalRequest(terminal, {action: "claim", claimId: nonces[winner]});
    assert.equal("sale" in completedClaim && completedClaim.sale, null);
    const cardClaim = await handleTerminalRequest(terminal, {action: "claim", claimId: randomUUID()});
    assert.ok("sale" in cardClaim && cardClaim.sale);
    const cardProof = {...proof, requestId: cardClaim.sale.id, paymentMethod: "CARD_TERMINAL", receipt: {...proof.receipt, documentNumber: "124"}};
    await handleTerminalRequest(terminal, {action: "result", result: {...cardProof, outcome: "UNKNOWN"}});
    assert.equal((await prisma.order.findUniqueOrThrow({where: {id: card.id}})).status, "AWAITING_PAYMENT");
    await Promise.all(Array.from({length: 4}, () => handleTerminalRequest(terminal, {action: "result", result: cardProof})));
    ledger = await prisma.cashierShift.findUniqueOrThrow({where: {id: shift.id}});
    assert.equal(ledger.cardSalesAmount, 80000);
    assert.equal(ledger.cashSalesAmount, 80000);
    assert.equal(ledger.onlineSalesAmount, 0);
    assert.equal(await prisma.cashOperation.count({where: {orderId: card.id}}), 0);
    await assert.rejects(handleTerminalRequest(terminal, {action: "result", result: {...cardProof, amount: 1}}));
    await assert.rejects(createCashierSale({...input, paymentMethod: "CARD_ONLINE"}, cashier.id, key+"-fake-online"));
    const rejected = await createCashierSale({...input, paymentMethod: "CARD_TERMINAL", cashReceived: undefined}, cashier.id, key+"-declined");
    const rejectClaim = await handleTerminalRequest(terminal, {action: "claim", claimId: randomUUID()});
    assert.ok("sale" in rejectClaim && rejectClaim.sale);
    await assert.rejects(handleTerminalRequest(terminal, {action: "result", result: {...cardProof, requestId: rejectClaim.sale.id}}));
    await handleTerminalRequest(terminal, {action: "result", result: {requestId: rejectClaim.sale.id, outcome: "DECLINED"}});
    assert.equal((await prisma.order.findUniqueOrThrow({where: {id: rejected.id}})).status, "CANCELLED");
    assert.equal(await prisma.ticket.count({where: {orderId: rejected.id}}), 0);
    assert.equal((await prisma.cashierShift.findUniqueOrThrow({where: {id: shift.id}})).cardSalesAmount, 80000);


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
    assert.equal(count, 3);
  } finally {
    if (previousTerminals === undefined) delete process.env.EVOTOR_TERMINALS_JSON;
    else process.env.EVOTOR_TERMINALS_JSON = previousTerminals;
    await prisma.evotorCheckout.deleteMany({ where: { order: { sessionId: session.id } } });
    await prisma.ticket.deleteMany({ where: { sessionId: session.id } });
    await prisma.payment.deleteMany({ where: { order: { sessionId: session.id } } });
    await prisma.orderItem.deleteMany({ where: { order: { sessionId: session.id } } });
    await prisma.cashOperation.deleteMany({ where: { shift: { locationId: location.id } } });
    await prisma.order.deleteMany({ where: { sessionId: session.id } });
    await prisma.cashierShift.deleteMany({ where: { locationId: location.id } });
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.priceRule.deleteMany({ where: { locationId: location.id } });
    await prisma.location.delete({ where: { id: location.id } });
    await prisma.user.delete({ where: { id: cashier.id } });
    await prisma.$disconnect();
  }
});
