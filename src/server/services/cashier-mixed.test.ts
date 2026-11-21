import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { cashierSaleSchema } from "@/lib/validation/cashier";
import { createCashierSale } from "./cashier-sales";
import { computeShiftCashSummary } from "./cashier-shifts";
import { initiateRefund } from "./refunds";

test("adult by terminal and child by cash use one order and separate tenders", async t => {
  if (!process.env.MIXED_TEST_DB || new URL(process.env.DATABASE_URL!).hostname !== "127.0.0.1") {
    t.skip("Requires a disposable local PostgreSQL database");
    return;
  }
  const key = randomUUID();
  const location = await prisma.location.create({data:{slug:key,name:"Test",city:"Test",address:"Test",status:"ACTIVE",timezone:"Europe/Saratov"}});
  const cashier = await prisma.user.create({data:{email:key+"@example.test",name:"Test",passwordHash:"x",role:"CASHIER",status:"ACTIVE"}});
  const shift = await prisma.cashierShift.create({data:{userId:cashier.id,locationId:location.id,openingCashAmount:0,status:"OPEN"}});
  const session = await prisma.session.create({data:{locationId:location.id, startsAt:new Date(Date.now()+600000),endsAt:new Date(Date.now()+1800000),capacity:15,status:"SCHEDULED"}});
  for (const [code, price] of [["ADULT",110000],["CHILD",100000]] as const) {
    const ticket = await prisma.ticketType.upsert({where:{code},update:{},create:{code,name:code}});
    for(const dayType of ["WEEKDAY","WEEKEND"] as const) await prisma.priceRule.create({data:{locationId:location.id,ticketTypeId:ticket.id,dayType,priceAmount:price,validFrom:new Date(0)}});
  }
  const input = cashierSaleSchema.parse({sessionPublicId:session.publicId,items:[{ticketTypeCode:"ADULT",quantity:1},{ticketTypeCode:"CHILD",quantity:1}],paymentMethod:"MIXED",cashTicketCodes:["CHILD"]});
  const order = await createCashierSale(input,cashier.id,key);
  assert.equal((await createCashierSale(input,cashier.id,key)).id,order.id);
  assert.deepEqual(Object.fromEntries((await prisma.payment.findMany({where:{orderId:order.id}})).map(p=>[p.method,p.amount])),{CASH:100000,CARD_TERMINAL:110000});
  const summary = await computeShiftCashSummary(shift.id);
  assert.deepEqual([summary.shift.ordersCount,summary.shift.ticketsCount,summary.shift.cashSalesAmount,summary.shift.cardSalesAmount],[1,2,100000,110000]);
  const tickets = await prisma.ticket.findMany({where:{orderId:order.id},include:{orderItem:true}});
  assert.equal(tickets.length,2);
  for(const ticket of tickets) {
    await initiateRefund({orderNumber:order.number,actorId:cashier.id,actorRole:"DIRECTOR",reason:"Test",ticketPublicIds:[ticket.publicId]});
  }
  const refunded = await computeShiftCashSummary(shift.id);
  assert.equal(refunded.cashRefunds,100000);
  assert.equal(await prisma.payment.count({where:{orderId:order.id,status:"REFUNDED"}}),2);
});
