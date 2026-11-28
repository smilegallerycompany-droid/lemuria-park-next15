/* eslint-disable @typescript-eslint/no-explicit-any -- Deliberately partial Prisma transaction mocks; real database concurrency is tested separately. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { authenticateTerminal, handleTerminalRequest, terminalForLocation } from "./evotor-checkout";
import { ApiError } from "@/lib/api/response";

test("malformed terminal configuration fails closed with a useful 503", () => {
  const before = process.env.EVOTOR_TERMINALS_JSON;
  try {
    for (const invalid of ["{", "{}", '[{"id":"terminal","locationId":"location","tokenHash":"bad"}]']) {
      process.env.EVOTOR_TERMINALS_JSON = invalid;
      assert.throws(() => terminalForLocation("location"),
        error => error instanceof ApiError && error.code === "NOT_CONFIGURED" && error.status === 503);
    }
  } finally {
    if (before === undefined) delete process.env.EVOTOR_TERMINALS_JSON;
    else process.env.EVOTOR_TERMINALS_JSON = before;
  }
});

test("terminal credentials are bound to exactly one location and reject the connectivity label", () => {
  const before = process.env.EVOTOR_TERMINALS_JSON;
  const token = "private-test-token-12345678901234567890";
  process.env.EVOTOR_TERMINALS_JSON = JSON.stringify([{id: "t1", locationId: "l1", tokenHash: createHash("sha256").update(token).digest("hex")}]);
  try {
    assert.equal(terminalForLocation("l1")?.id, "t1");
    assert.equal(terminalForLocation("l2"), null);
    const req = (token: string) => new Request("https://example.com", {headers:{authorization:`Bearer ${token}`}});
    assert.equal(authenticateTerminal(req(token)).id, "t1");
    assert.throws(() => authenticateTerminal(req("lemuria-evotor-staging-connectivity")));
    assert.throws(() => authenticateTerminal(req(token + "wrong")));
  } finally { if (before === undefined) delete process.env.EVOTOR_TERMINALS_JSON; else process.env.EVOTOR_TERMINALS_JSON = before; }
});

test("a claimed checkout cannot be issued twice, including after UNKNOWN", async t => {
  const job = {id:"job", claimId: null as string | null, state:"QUEUED", terminalId:"t1", cashReceived:100000, changeAmount:10000,
    receiptPayload: {version:1,totalAmount:90000,items:[{code:"ADULT",quantity:1,amount:90000}]},
    order:{locationId:"l1", source:"CASHIER", status:"AWAITING_PAYMENT", totalAmount:90000, payments:[{method:"CASH",status:"PENDING"}], items:[{ticketType:{code:"ADULT"}, quantity:1, subtotalAmount:90000}]}};
  const tx = {
    $queryRaw: async () => [],
    evotorCheckout: {
      findFirst: async ({where}: any) => where.claimId ? (where.claimId === job.claimId ? job : null) : (where.state === job.state ? job : null),
      findUnique: async () => job,
      update: async ({data}: any) => Object.assign(job, data),
    },
  };
  const original = prisma.$transaction;
  prisma.$transaction = (async (fn: any) => fn(tx)) as typeof original;
  t.after(() => { prisma.$transaction = original; });
  const terminal = {id:"t1", locationId:"l1"};
  const originalSnapshot = job.receiptPayload;
  job.receiptPayload = {...originalSnapshot, totalAmount:1};
  await assert.rejects(handleTerminalRequest(terminal, {action:"claim",claimId:"11111111-1111-4111-8111-111111111111"}), /состав чека/);
  assert.equal(job.state,"QUEUED");
  assert.equal(job.claimId,null);
  job.receiptPayload = originalSnapshot;
  const first = await handleTerminalRequest(terminal, {action:"claim",claimId:"11111111-1111-4111-8111-111111111111"});
  assert.equal((first as any).sale.cashReceived, 100000);
  assert.equal((first as any).sale.changeAmount, 10000);
  job.order.items[0].ticketType.code = "RENAMED_AFTER_ORDER";
  const recovered = await handleTerminalRequest(terminal, {action:"claim",claimId:"11111111-1111-4111-8111-111111111111"});
  assert.equal((recovered as any).sale.id, "job");
  assert.equal((recovered as any).sale.items[0].code, "ADULT");
  await assert.rejects(
    handleTerminalRequest({id:"t1", locationId:"other-location"}, {action:"claim",claimId:"11111111-1111-4111-8111-111111111111"}),
    /перепривязана/,
  );
  assert.equal(job.state, "CLAIMED");
  const second = await handleTerminalRequest(terminal, {action:"claim",claimId:"22222222-2222-4222-8222-222222222222"});
  assert.equal((second as any).sale, null);
  assert.equal((second as any).unresolvedRequestId, "job");
  await handleTerminalRequest(terminal, {action:"result", result:{requestId:"job", outcome:"UNKNOWN"}});
  assert.equal(job.state, "CLAIMED");
  await assert.rejects(handleTerminalRequest({id:"other",locationId:"l1"}, {action:"result", result:{requestId:"job",outcome:"DECLINED"}}));
  await assert.rejects(handleTerminalRequest(terminal, {action:"result", result:{requestId:"job",outcome:"FISCALIZED",amount:1,paymentMethod:"CASH"}}));
  assert.equal(job.state, "CLAIMED");
});

test("repeated fiscal proof acknowledges once and conflicting proof is rejected", async t => {
  const result = {requestId:"job",outcome:"FISCALIZED",amount:90000,paymentMethod:"CASH",receipt:{serial:"1234567890123456",documentNumber:"1",fiscalSign:"123"}};
  const job = {terminalId:"t1",state:"FISCALIZED",result:JSON.parse(JSON.stringify(result)),order:{locationId:"l1"}};
  const tx = {$queryRaw:async()=>[],evotorCheckout:{findUnique:async()=>job}};
  const original = prisma.$transaction;
  prisma.$transaction = (async (fn: any) => fn(tx)) as typeof original;
  t.after(() => { prisma.$transaction = original; });
  assert.deepEqual(await handleTerminalRequest({id:"t1",locationId:"l1"},{action:"result",result}),{state:"FISCALIZED"});
  await assert.rejects(handleTerminalRequest({id:"t1",locationId:"l1"},{action:"result",result:{...result,amount:1}}));
});

test("first fiscal result records net cash, tickets and shift exactly once", async t => {
  const payment = {id:"p",method:"CASH",status:"PENDING"};
  const order = {id:"o", locationId:"l1", source:"CASHIER", status:"AWAITING_PAYMENT",totalAmount:90000,
    shiftId:"s",cashierId:"u",sessionId:"session",payments:[payment],tickets:[] as any[],
    items:[{id:"i",ticketTypeId:"adult",quantity:1}],
    extras:[{code:"FEED",quantity:2,subtotalAmount:60000}]};
  const job: any = {id:"job",terminalId:"t1",state:"CLAIMED",order,
    receiptPayload:{version:1,totalAmount:90000,items:[{code:"ADULT",quantity:1,amount:30000},{code:"FEED",quantity:2,amount:60000}]}};
  const shifts: any[] = [], cash: any[] = [];
  const tx = {
    $queryRaw:async()=>[], evotorCheckout:{findUnique:async()=>job,update:async({data}:any)=>Object.assign(job,data)},
    order:{update:async({data}:any)=>Object.assign(order,data),findUnique:async()=>order},
    payment:{update:async({data}:any)=>Object.assign(payment,data)},
    cashierShift:{update:async(args:any)=>shifts.push(args)},
    cashOperation:{create:async(args:any)=>cash.push(args)},
    ticket:{create:async({data}:any)=>{order.tickets.push(data);return data;}},
    auditLog:{create:async()=>({})},
  };
  const original=prisma.$transaction;
  prisma.$transaction=(async(fn:any)=>fn(tx)) as typeof original;
  t.after(()=>{prisma.$transaction=original;});
  const result={requestId:"job",outcome:"FISCALIZED",amount:90000,paymentMethod:"CASH",
    receipt:{serial:"1234567890123456",documentNumber:"4",fiscalSign:"123"}};
  await handleTerminalRequest({id:"t1",locationId:"l1"},{action:"result",result});
  await handleTerminalRequest({id:"t1",locationId:"l1"},{action:"result",result});
  assert.equal(order.status,"PAID"); assert.equal(payment.status,"SUCCEEDED");
  assert.equal(shifts.length,1); assert.equal(shifts[0].data.cashSalesAmount.increment,90000);
  assert.equal(shifts[0].data.ticketsCount.increment,1);
  assert.equal(cash.length,1); assert.equal(cash[0].data.amount,90000);
  assert.equal(order.tickets.length,1); assert.equal(job.fiscalKey,"1234567890123456:4");
});

test("decline never records revenue or issues a ticket", async t => {
  const job:any={id:"job",terminalId:"t1",state:"CLAIMED",order:{id:"o",locationId:"l1",cashierId:"u",
    source:"CASHIER",status:"AWAITING_PAYMENT",payments:[{id:"p",status:"PENDING"}]}};
  const updates:any[]=[];
  const tx={$queryRaw:async()=>[],evotorCheckout:{findUnique:async()=>job,update:async({data}:any)=>Object.assign(job,data)},
    order:{update:async({data}:any)=>updates.push(data)},payment:{update:async({data}:any)=>updates.push(data)},auditLog:{create:async()=>({})}};
  const original=prisma.$transaction;prisma.$transaction=(async(fn:any)=>fn(tx)) as typeof original;
  t.after(()=>{prisma.$transaction=original;});
  await handleTerminalRequest({id:"t1",locationId:"l1"},{action:"result",result:{requestId:"job",outcome:"DECLINED"}});
  assert.deepEqual(updates,[{status:"CANCELLED"},{status:"FAILED"}]);
});
