"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {handle}=require("./evotor-production-status.cjs");
const {makeStatusRoute}=require("./build-evotor-production-sales.cjs");
class ApiError extends Error { constructor(code,message,status){super(message);this.code=code;this.status=status;} }
function context(){
  return {ApiError,requireCashier:async()=>({id:"cashier",role:"CASHIER",locationIds:["loc"]}),
    locationIdsForActor:user=>user.role==="OWNER"?null:user.locationIds,
    handleApiError:error=>Response.json({ok:false,error:{code:error.code}},{status:error.status||500}),
    prisma:{order:{findFirst:async()=>null}}};
}
const request=()=>new Request("https://example.invalid/api/cashier/sales/status?number=sale&cashierId=foreign");
test("status authenticates before DB access and never caches auth failures",async()=>{
  const ctx=context();ctx.requireCashier=async()=>{throw new ApiError("UNAUTHORIZED","login",401);};
  ctx.prisma.order.findFirst=async()=>{assert.fail("unauthenticated query");};
  const result=await handle(request(),ctx);
  assert.equal(result.status,401);assert.equal(result.headers.get("cache-control"),"no-store");
});
test("status preserves deployed location policy, cashier ownership and pending state",async()=>{
  for(const role of ["CASHIER","ADMIN","OWNER"]){
    const ctx=context();ctx.requireCashier=async()=>({id:"cashier",role,locationIds:[]});
    ctx.prisma.order.findFirst=async({where,select})=>{
      assert.deepEqual(where,{number:"sale",cashierId:"cashier",source:"CASHIER",...(role==="OWNER"?{}:{locationId:{in:[]}})});
      assert.equal(select.customerPhone,undefined);
      return {number:"sale",status:"AWAITING_PAYMENT",totalAmount:90000,evotorCheckout:{state:"CLAIMED"}};
    };
    const result=await handle(request(),ctx);
    assert.equal(result.headers.get("cache-control"),"no-store");
    assert.equal((await result.json()).data.status,"AWAITING_PAYMENT");
  }
});
test("status hides missing orders and bounds lookup input",async()=>{
  const ctx=context();
  assert.equal((await handle(request(),ctx)).status,404);
  ctx.prisma.order.findFirst=async()=>assert.fail("invalid input queried DB");
  assert.equal((await handle(new Request("https://example.invalid?number="+"a".repeat(129)),ctx)).status,400);
});
const root=process.env.EVOTOR_PRODUCTION_REVIEW_ROOT;
test("status route uses the current deployed authentication and role scope",{skip:!root},()=>{
  const body=fs.readFileSync(path.join(root,".next/server/app/api/cashier/sales/route.js"),"utf8");
  const patched=makeStatusRoute(body);
  assert.ok(patched.includes('GET:()=>evotorStatus'));
  assert.ok(patched.includes('requireCashier:x.Xf,locationIdsForActor:y.eC'));
  assert.ok(patched.includes('pathname:"/api/cashier/sales/status"'));
  assert.throws(()=>makeStatusRoute(patched),/Unknown production/);
});
