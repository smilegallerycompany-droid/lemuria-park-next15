"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {createPending,parseSale}=require("./evotor-production-sales.cjs");
const {patchSalesRoute}=require("./build-evotor-production-sales.cjs");
const {prepareQuotedEvotorReceipt}=require("../src/server/services/evotor-receipt.ts");
const {ApiError}=require("../src/lib/api/response.ts");
const root=process.env.EVOTOR_PRODUCTION_REVIEW_ROOT;
const domain={ApiError,prepareQuotedEvotorReceipt,terminalForLocation:()=>({id:"evotor"})};
const input={number:"test",sessionId:"primary",locationId:"location",cashierId:"cashier",shiftId:"shift",
  customerName:"Гость",customerPhone:"+70000000000",customerEmail:"guest@example.invalid",
  totalAmount:150000,paymentMethod:"CASH",idempotencyKey:"unique",idempotencyPayloadHash:"hash",
  items:[{ticketTypeId:"type",ticketTypeName:"Комбо",secondarySessionId:"secondary",quantity:1,unitPriceAmount:100000,subtotalAmount:100000}],
  extras:[{code:"FEED",name:"Корм",quantity:1,unitPriceAmount:30000,subtotalAmount:30000},
    {code:"PHOTO",name:"Фото",quantity:1,unitPriceAmount:20000,subtotalAmount:20000}]};
const priced={quote:input,ticketTypes:[{id:"type",code:"BUNDLE"}],cashReceived:200000};

function repository(){
  const context={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,".next/server/chunks/670.js"),"utf8"),context);
  const exports={};const webpack=()=>{throw Error("Unexpected dependency");};
  webpack.d=(target,fields)=>{for(const [key,get] of Object.entries(fields))Object.defineProperty(target,key,{get});};
  context.exports.modules[73073]({},exports,webpack);
  return exports.n;
}

test("cash amount is added without weakening deployed strict request validation",()=>{
  const parse=body=>{assert.equal(Object.hasOwn(body,"cashReceived"),false);assert.equal(body.quoteFingerprint,"checked");return body;};
  assert.equal(parseSale({quoteFingerprint:"checked",cashReceived:200000},parse,ApiError).cashReceived,200000);
  assert.throws(()=>parseSale({quoteFingerprint:"checked",cashReceived:1.5},parse,ApiError),/сумма/);
});

test("invalid cash or unconfigured terminal writes nothing",async()=>{
  const never=()=>{throw Error("Unexpected write");};
  await assert.rejects(createPending({},input,{...priced,cashReceived:10},never,domain),/полученную/);
  await assert.rejects(createPending({},input,priced,never,{...domain,terminalForLocation:()=>null}),/не настроен/);
  await assert.rejects(createPending({},{...input,idempotencyKey:undefined},priced,never,domain),/идентификатор/);
  await assert.rejects(createPending({},{...input,paymentMethod:"CARD_ONLINE"},priced,never,domain),/Эвотор/);
});

test("real production mapping keeps bundle/extras but writes pending payment and queue atomically",{skip:!root},async()=>{
  const repo=repository();let recorded;
  const tx={order:{async create(args){recorded=args;return {id:"order",status:args.data.status};}}};
  const result=await createPending(tx,input,priced,repo.createCashierPaid,domain);
  assert.equal(result.status,"AWAITING_PAYMENT");
  assert.equal(recorded.data.paidAt,null);
  assert.equal(recorded.data.payments.create.status,"PENDING");
  assert.equal(recorded.data.payments.create.succeededAt,null);
  assert.equal(recorded.data.items.create[0].secondarySessionId,"secondary");
  assert.deepEqual(recorded.data.extras.create,input.extras);
  assert.equal(recorded.data.idempotencyPayloadHash,"hash");
  assert.equal(recorded.data.shiftId,"shift");
  const queue=recorded.data.evotorCheckout.create;
  assert.equal(queue.cashReceived,200000);assert.equal(queue.changeAmount,50000);
  assert.deepEqual(queue.receiptPayload.items,[{code:"BUNDLE",quantity:1,amount:100000},{code:"FEED",quantity:1,amount:30000},{code:"PHOTO",quantity:1,amount:20000}]);
  assert.equal(recorded.data.paymentExpiresAt,null);
});

test("card does not pass cash received or change to the terminal",{skip:!root},async()=>{
  let recorded;const tx={order:{async create(args){recorded=args;return {status:args.data.status};}}};
  await createPending(tx,{...input,paymentMethod:"CARD_TERMINAL"},priced,repository().createCashierPaid,domain);
  assert.equal(recorded.data.evotorCheckout.create.cashReceived,null);
  assert.equal(recorded.data.evotorCheckout.create.changeAmount,null);
});

test("exact deployed sales route patches without replacing its validation flow",{skip:!root},()=>{
  const source=fs.readFileSync(path.join(root,".next/server/app/api/cashier/sales/route.js"),"utf8");
  const patched=patchSalesRoute(source);
  // Pending return is after all original transaction locks/quote checks and
  // before ledger mutation/ticket issuance; compiled mapping remains unchanged.
  assert.ok(patched.indexOf('(0,I.dY)(b.quoteFingerprint,p)') < patched.indexOf('.createPending(a,{'));
  assert.ok(patched.includes('cashier-seat-reserve.cjs'));
  assert.ok(patched.includes('secondarySessionPublicId'));
  assert.ok(patched.includes('if("AWAITING_PAYMENT"===s.status)return s;return await (0,U.wS)'));
  assert.throws(()=>patchSalesRoute(patched),/Unknown production/);
});
