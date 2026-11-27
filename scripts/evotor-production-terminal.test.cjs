"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {handle,withPaymentDates}=require("./evotor-production-terminal.cjs");
const {makeTerminalRoute}=require("./build-evotor-production-sales.cjs");
const {createTerminalHandler}=require("../src/server/services/evotor-checkout-core.ts");
const {ApiError}=require("../src/lib/api/response.ts");
const {checkLabel}=require("./evotor-connectivity.cjs");

test("fiscal proof invokes deployed accounting and bundle ticket issuer once",async()=>{
  const calls=[];
  const order={id:"order",locationId:"location",source:"CASHIER",status:"AWAITING_PAYMENT",totalAmount:150000,
    shiftId:"shift",cashierId:"cashier",items:[{quantity:1,secondarySessionId:"second"}],
    payments:[{id:"payment",method:"CASH",status:"PENDING"}]};
  const job={id:"job",terminalId:"terminal",state:"CLAIMED",order,
    receiptPayload:{version:1,totalAmount:150000,items:[{code:"BUNDLE",quantity:1,amount:100000},{code:"FEED",quantity:1,amount:50000}]}};
  const tx={
    $queryRaw:async()=>[],
    evotorCheckout:{findUnique:async()=>job,update:async({data})=>Object.assign(job,data)},
    order:{async update({data}){Object.assign(order,data);}},
    payment:{async update({data}){Object.assign(order.payments[0],data);}},
  };
  const now=new Date("2026-11-27T16:00:00Z");
  const prisma={$transaction:async fn=>fn(tx)};
  const handler=createTerminalHandler({prisma:withPaymentDates(prisma,()=>now),
    recordAuditLog:async(...args)=>calls.push(["audit",args]),
    recordSaleOnShift:async(db,input)=>{calls.push(["ledger",input]);assert.equal(db.order.update instanceof Function,true);},
    issueTicketsForOrder:async(id,db)=>{assert.equal(id,"order");assert.equal(order.status,"PAID");calls.push(["production-bundle-issuer",id]);},
  });
  const result={action:"result",result:{requestId:"job",outcome:"FISCALIZED",amount:150000,paymentMethod:"CASH",
    receipt:{serial:"1234567890123456",documentNumber:"7",fiscalSign:"123"}}};
  await handler({id:"terminal",locationId:"location"},result);
  await handler({id:"terminal",locationId:"location"},result);
  assert.equal(order.paidAt,now);assert.equal(order.payments[0].succeededAt,now);
  assert.equal(calls.filter(x=>x[0]==="ledger").length,1);
  assert.equal(calls.find(x=>x[0]==="ledger")[1].amount,150000);
  assert.equal(calls.filter(x=>x[0]==="production-bundle-issuer").length,1);
  assert.equal(order.payments[0].providerPaymentId,"evotor:1234567890123456:7");
});

test("HTTP boundary authenticates before processing body and bounds request size",async()=>{
  const context={handleApiError:()=>Response.json({ok:false},{status:500})};
  const domain={ApiError,authenticateTerminal:()=>{throw new ApiError("UNAUTHORIZED","Нет доступа",401);}};
  assert.equal((await handle(new Request("https://example.invalid",{method:"POST",body:"{}"}),context,domain)).status,401);
  domain.authenticateTerminal=()=>({id:"terminal",locationId:"location"});
  assert.equal((await handle(new Request("https://example.invalid",{method:"POST",body:"x".repeat(16385)}),context,domain)).status,413);
  assert.equal((await handle(new Request("https://example.invalid",{method:"POST",body:"{"}),context,domain)).status,400);
});

test("staging diagnostic never reaches the payment handler",async()=>{
  const {APP_ENV}=process.env;
  const url="https://example.invalid/api/integrations/evotor/checkout";
  const domain={ApiError,authenticateTerminal:()=>{throw new ApiError("UNAUTHORIZED","Нет доступа",401);}};
  const diagnostic=action=>new Request(url,{method:"POST",body:JSON.stringify({action}),
    headers:{authorization:"Bearer "+checkLabel,"content-type":"application/json"}});
  try {
    process.env.APP_ENV="staging";
    const response=await handle(diagnostic("claim"),{},domain);
    assert.deepEqual((await response.json()).data,{mode:"CONNECTIVITY_ONLY",sale:null,unresolvedRequestId:null});
    assert.equal((await handle(diagnostic("result"),{},domain)).status,409);
    process.env.APP_ENV="production";
    assert.equal((await handle(diagnostic("claim"),{},domain)).status,401);
    assert.equal((await handle(new Request(url),{},domain)).status,404);
  } finally {
    if(APP_ENV===undefined)delete process.env.APP_ENV;
    else process.env.APP_ENV=APP_ENV;
  }
});

const root=process.env.EVOTOR_PRODUCTION_REVIEW_ROOT;
test("terminal route binds to deployed ticket and ledger services, not old source services",{skip:!root},()=>{
  const result=makeTerminalRoute(fs.readFileSync(path.join(root,".next/server/app/api/cashier/sales/route.js"),"utf8"));
  assert.ok(result.includes('recordSaleOnShift:U.wS,issueTicketsForOrder:T.G'));
  assert.ok(result.includes('page:"/api/integrations/evotor/checkout/route"'));
  assert.ok(result.includes('require("../../../../../webpack-runtime.js")'));
  assert.ok(!result.includes('c.d(d,{POST:()=>Z})'));
});
