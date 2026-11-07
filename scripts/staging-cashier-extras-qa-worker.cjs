'use strict';
// Synthetic staff, orders and shift only in isolated lemuria_staging. No provider calls.
const http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {PrismaClient}=require('/app/node_modules/@prisma/client');const db=new PrismaClient({log:[]});
const ORIGIN='https://d5d9sorlbdsebnpfr97f.0ly8ed4d.apigw.yandexcloud.net';
async function guard(){assert.equal(process.env.APP_ENV,'staging');const[r]=await db.$queryRawUnsafe('SELECT current_database() AS name');assert.equal(r.name,'lemuria_staging')}
async function request(path,{cookie,body,key}={}){const r=await fetch(ORIGIN+path,{method:body?'POST':'GET',redirect:'manual',headers:{'Content-Type':'application/json',Origin:ORIGIN,...(cookie?{Cookie:cookie}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});return{status:r.status,data:await r.json(),cookie:r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')}}
async function test(){await guard();let user,shift,orderId,sessionId;const result=[];const suffix=crypto.randomUUID();try{
 const loc=await db.location.findFirst({where:{slug:'saratov',status:'ACTIVE'}});assert.ok(loc);
 const type=await db.ticketType.findFirst({where:{isActive:true,availableAtCashier:true,qualifiesAsAdultCompanion:true,isTwoParkBundle:false}});assert.ok(type);
 const extras=await db.cashierExtra.findMany({where:{code:{in:['FEED','PHOTO']},isActive:true}});assert.equal(extras.length,2);
 const password=crypto.randomBytes(32).toString('base64url');user=await db.user.create({data:{name:'Synthetic cashier extras QA',email:`qa-extras-${suffix}@example.invalid`,passwordHash:await require('/app/node_modules/bcryptjs').hash(password,12),role:'CASHIER',status:'ACTIVE',locations:{create:{locationId:loc.id}}}});
 const login=await request('/api/auth/login',{body:{email:user.email,password,portal:'cashier'}});assert.equal(login.status,200);assert.ok(login.cookie);
 shift=await db.cashierShift.create({data:{userId:user.id,locationId:loc.id,status:'OPEN',openingCashAmount:0,notes:'Synthetic staging cashier extras QA'}});
 const start=new Date(Date.now()+3600000);const session=await db.session.create({data:{locationId:loc.id,startsAt:start,endsAt:new Date(+start+1200000),capacity:15,status:'SCHEDULED'}});sessionId=session.id;
 const selection={sessionPublicId:session.publicId,items:[{ticketTypeCode:type.code,quantity:1}],extras:[{code:'FEED',quantity:2},{code:'PHOTO',quantity:1}]};
 const quote=await request('/api/cashier/quote',{cookie:login.cookie,body:selection});assert.equal(quote.status,200,quote.data?.error?.code);assert.ok(quote.data.data.fingerprint);result.push({test:'server_quote_with_feed_and_photo',ok:true});
 const key=crypto.randomUUID(),body={...selection,paymentMethod:'CASH',quoteFingerprint:quote.data.data.fingerprint,adultCompanionConfirmed:true};
 const sale=await request('/api/cashier/sales',{cookie:login.cookie,body,key});assert.equal(sale.status,201,sale.data?.error?.code);const number=sale.data.data.number;assert.ok(number);const order=await db.order.findUnique({where:{number},include:{items:true,extras:true,tickets:true}});assert.ok(order);orderId=order.id;
 assert.equal(order.source,'CASHIER');assert.equal(order.cashierId,user.id);assert.equal(order.shiftId,shift.id);assert.equal(order.status,'PAID');assert.equal(order.extras.length,2);assert.equal(order.tickets.length,1);
 const tickets=order.items.reduce((s,i)=>s+i.subtotalAmount,0),goods=order.extras.reduce((s,i)=>s+i.subtotalAmount,0);assert.equal(order.totalAmount,tickets+goods);assert.equal(order.totalAmount,quote.data.data.totalAmount);for(const x of order.extras){const price=extras.find(e=>e.code===x.code).unitPriceAmount;assert.equal(x.subtotalAmount,price*x.quantity)}result.push({test:'cashier_order_with_separate_extra_lines',ok:true});
 const retry=await request('/api/cashier/sales',{cookie:login.cookie,body,key});assert.ok([200,201].includes(retry.status));assert.equal(retry.data.data.number,number);assert.equal(await db.order.count({where:{idempotencyKey:key}}),1);result.push({test:'retry_does_not_duplicate_sale',ok:true});
 const list=await request('/api/cashier/orders?filter=today',{cookie:login.cookie});assert.equal(list.status,200);const visible=list.data.data.orders.find(x=>x.number===number);assert.ok(visible);assert.equal(visible.items.length,3);result.push({test:'sale_visible_in_cashier_orders_with_extras',ok:true});
 const actualShift=await db.cashierShift.findUnique({where:{id:shift.id}});assert.equal(actualShift.ordersCount,1);assert.equal(actualShift.cashSalesAmount,order.totalAmount);assert.equal(actualShift.ticketsCount,1);result.push({test:'shift_counts_sale_once',ok:true});
 return {ok:true,allPassed:true,results:result,providerCharge:false,productionDataChanged:false};
 }finally{
 // Mark only this run's staging fixtures, retain evidence, revoke synthetic login.
 if(user){const pending=await db.order.findMany({where:{cashierId:user.id},select:{id:true}});const ids=pending.map(x=>x.id);if(ids.length){await db.ticket.updateMany({where:{orderId:{in:ids}},data:{status:'CANCELLED'}});await db.order.updateMany({where:{id:{in:ids}},data:{status:'CANCELLED'}})}}
 if(shift)await db.cashierShift.update({where:{id:shift.id},data:{status:'CLOSED',closedAt:new Date(),closingCashAmount:0,expectedCashAmount:0,cashDifferenceAmount:0}});
 if(user){await db.user.update({where:{id:user.id},data:{status:'DISABLED'}});await db.staffSession.deleteMany({where:{userId:user.id}})}
 }}
http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');if(req.url!=='/test'||req.method!=='POST'){res.writeHead(404);res.end('{}');return}try{res.end(JSON.stringify(await test()))}catch(e){res.writeHead(500);res.end(JSON.stringify({ok:false,error:e.code||e.name,message:String(e.message).slice(0,180)}))}}).listen(Number(process.env.PORT||8080),'0.0.0.0');
