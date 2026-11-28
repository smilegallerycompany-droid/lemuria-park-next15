"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const policy = require("./evotor-production-capacity.cjs");
const { patchRepository } = require("./build-evotor-production-capacity.cjs");

function database(rows, paid = []) {
  const calls = [];
  return { calls,
    orderItem: { async findMany(query) { calls.push(query); return rows; } },
    ticket: {
      async count() { return paid.reduce((n, p) => n + p._count._all, 0); },
      async groupBy() { return paid; },
    },
  };
}

test("waiting fiscalization holds both admissions; feed/photo are excluded by catalog", async () => {
  const db = database([
    {quantity:2,order:{sessionId:"first"},secondarySessionId:"second"},
    {quantity:1,order:{sessionId:"first"},secondarySessionId:null},
  ], [{sessionId:"second",_count:{_all:4}}]);
  const result = await policy.findOccupyingForSessions(db,["first","second"]);
  assert.deepEqual(result,[{sessionId:"first",quantity:3},{sessionId:"second",quantity:6}]);
  assert.deepEqual(db.calls[0].where.ticketType,{countsTowardCapacity:true});
  assert.deepEqual(db.calls[0].where.OR,[
    {order:{sessionId:{in:["first","second"]}}},
    {secondarySessionId:{in:["first","second"]}},
  ]);
});

test("single-session capacity includes a bundle whose primary admission is elsewhere", async () => {
  const db = database([{quantity:3,order:{sessionId:"elsewhere"},secondarySessionId:"here"}],
    [{sessionId:"here",_count:{_all:12}}]);
  assert.equal(await policy.aggregateOrderedQuantity(db,"here"),15);
});

test("online expiry stays finite, cashier UNKNOWN is retained by CLAIMED state", () => {
  const now = new Date("2026-11-27T15:00:00Z");
  const where = policy.pendingOrder(now);
  assert.equal(where.status,"AWAITING_PAYMENT");
  assert.deepEqual(where.OR,[{paymentExpiresAt:{gt:now}},
    {source:"CASHIER",evotorCheckout:{is:{state:{in:["QUEUED","CLAIMED"]}}}}]);
  // No PAID/DECLINED job, orphaned cashier order, or expired online hold is included.
});

test("empty session list does not issue database queries", async () => {
  const db=database([]);
  assert.deepEqual(await policy.findOccupyingForSessions(db,[]),[]);
  assert.equal(db.calls.length,0);
});

test("corrupt same-session bundle cannot double count one admission", async () => {
  const db=database([{quantity:2,order:{sessionId:"a"},secondarySessionId:"a"}]);
  assert.equal(await policy.aggregateOrderedQuantity(db,"a"),2);
});

test("unknown compiled repository fails before patching", () => {
  assert.throws(()=>patchRepository("something else"),/Unknown production/);
});

const root = process.env.EVOTOR_PRODUCTION_REVIEW_ROOT;
test("both exact production chunks route availability through the corrected implementation", {skip:!root}, async () => {
  for (const file of ["670.js","4654.js"]) {
    const source=fs.readFileSync(path.join(root,".next/server/chunks",file),"utf8");
    const patched=patchRepository(source);
    assert.throws(()=>patchRepository(patched),/Unknown production/);
    const context={exports:{},require(name){
      assert.equal(name,"/app/evotor-production-capacity.cjs");return policy;
    }};
    vm.runInNewContext(patched,context);
    const module=context.exports.modules[73073];
    assert.equal(typeof module,"function");
    const exports={};
    const webpack=()=>{throw Error("Unexpected dependency");};
    webpack.d=(target,getters)=>{for(const [k,get] of Object.entries(getters))Object.defineProperty(target,k,{get});};
    module({},exports,webpack);
    const repo=exports.n;
    const db=database([{quantity:2,order:{sessionId:"first"},secondarySessionId:"second"}]);
    assert.equal(await repo.aggregateOrderedQuantity(db,"second"),2);
    assert.deepEqual(await repo.findOccupyingForSessions(db,["first","second"]),[
      {sessionId:"first",quantity:2},{sessionId:"second",quantity:2}]);
    assert.equal(typeof repo.createCashierPaid,"function");
    assert.equal(typeof repo.findByIdempotencyKey,"function");
  }
});
