"use strict";
// Private IAM-only acceptance probe. No app startup or credentials returned.
// The optional staging fixture test always rolls back its transaction.
const http=require('node:http');
const assert=require('node:assert/strict');
const {PrismaClient}=require('/app/node_modules/@prisma/client');
const env=process.env;
const url=env.DATABASE_URL||`postgresql://${encodeURIComponent(env.DB_USER)}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${env.DB_PORT||6432}/${env.DB_NAME}?sslmode=require&connection_limit=1&connect_timeout=10`;
process.env.DATABASE_URL=url;
const db=new PrismaClient({datasources:{db:{url}},log:[]});
const trace={};
let transactionOverride=null;
function observe(tx){return new Proxy(tx,{get(t,model){
 if(model==='payment'||model==='refund')return new Proxy(t[model],{get(table,method){
  const original=table[method];if(typeof original!=='function')return original;
  return function(args){if((model==='payment'&&method==='groupBy')||(model==='refund'&&method==='findMany'))trace[model]=args;return original.call(table,args);};
 }});
 return t[model];
}});}
globalThis.prisma=new Proxy(db,{get(target,key){
 if(key==='$transaction')return (callback,options)=>transactionOverride?callback(observe(transactionOverride)):target.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20000ms'");
  return callback(observe(tx));
 },options);
 const source=transactionOverride||target;const value=source[key];return typeof value==='function'?value.bind(source):value;
}});
let finance;
async function loadFinance(){
 if(!finance){require('/app/.next/server/app/api/director/finance/route.js');finance=require('/app/.next/server/webpack-runtime.js')(60664).n;assert.equal(typeof finance,'function');}
 return finance;
}
async function check(){
 const [identity]=await db.$queryRawUnsafe('SELECT current_database() AS database');
 assert.equal(identity.database,env.QA_EXPECTED_DB);
 assert.ok(['lemuria_staging','lemuria'].includes(identity.database));
 await loadFinance();
 const day=env.QA_DAY||new Date().toISOString().slice(0,10);
 const locations=await db.location.findMany({select:{id:true}});assert.ok(locations.length);
 const actor={id:'private-readonly-qa',role:'OWNER',status:'ACTIVE',readOnly:true,locations:locations.map(x=>x.id)};
 const report=await finance(actor,{from:day,to:day,page:1});
 for(const model of ['payment','refund']){
  assert.ok(trace[model]);
  const conditions=trace[model].where;
  // No assigned locations must match no financial records.
  if(conditions.id){assert.deepEqual(conditions,{id:{in:[]}});continue;}
  assert.equal(conditions.AND[1].order.source,'CASHIER');
  assert.ok(Array.isArray(conditions.AND[0].OR));
 }
 const sums=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const paymentWhere=trace.payment.where.AND?.[0]||trace.payment.where;
  const refundWhere=trace.refund.where.AND?.[0]||trace.refund.where;
  const [allPayments,offlinePayments,allRefunds,offlineRefunds]=await Promise.all([
   tx.payment.groupBy({...trace.payment,where:paymentWhere}),
   tx.payment.groupBy(trace.payment),
   tx.refund.findMany({...trace.refund,where:refundWhere}),
   tx.refund.findMany(trace.refund),
  ]);
  const payments=rows=>rows.reduce((sum,x)=>sum+(x._sum.amount||0),0);
  const refunds=rows=>rows.reduce((sum,x)=>sum+x.amount,0);
  return {allPayments:payments(allPayments),offlinePayments:payments(offlinePayments),allRefunds:refunds(allRefunds),offlineRefunds:refunds(offlineRefunds)};
 },{timeout:25000});
 assert.equal(report.refunds.total,sums.offlineRefunds);
 assert.equal(report.revenue.total,report.revenue.cash+report.revenue.card);
 assert.equal(report.net,report.revenue.total-report.refunds.total-report.expenses.total);
 assert.ok(sums.offlinePayments<=sums.allPayments);
 assert.ok(sums.offlineRefunds<=sums.allRefunds);
 return {ok:true,database:identity.database,day,offlineScopeVerified:true,allPaymentsKopecks:sums.allPayments,offlinePaymentsKopecks:sums.offlinePayments,excludedOnlinePaymentsKopecks:sums.allPayments-sums.offlinePayments,excludedOnlineRefundsKopecks:sums.allRefunds-sums.offlineRefunds,revenue:report.revenue,refunds:report.refunds,expensesKopecks:report.expenses.total,netKopecks:report.net};
}
async function fixtureCheck(){
 assert.equal(env.QA_EXPECTED_DB,'lemuria_staging');assert.equal(env.QA_ALLOW_ROLLBACK_FIXTURES,'1');
 const [identity]=await db.$queryRawUnsafe('SELECT current_database() AS database');assert.equal(identity.database,'lemuria_staging');
 await loadFinance();
 const owner=await db.user.findFirst({where:{role:'OWNER',status:'ACTIVE'},select:{id:true}});assert.ok(owner);
 const session=await db.session.findFirst({where:{location:{status:'ACTIVE'}},select:{id:true,locationId:true}});assert.ok(session);
 const day=env.QA_DAY||'2026-11-04',when=new Date(day+'T12:00:00.000Z');
 const actor={id:owner.id,role:'OWNER',status:'ACTIVE',readOnly:true,locations:[session.locationId]};
 const params={from:day,to:day,page:1,locationId:session.locationId};
 const suffix=require('node:crypto').randomUUID(),numbers=['QA-OFFLINE-'+suffix,'QA-ONLINE-'+suffix];
 let result;const rollback=new Error('ROLLBACK_QA_SUCCESS');
 try{await db.$transaction(async tx=>{
  transactionOverride=tx;
  const before=await finance(actor,params);
  const offline=await tx.order.create({data:{number:numbers[0],sessionId:session.id,locationId:session.locationId,status:'PAID',source:'CASHIER',customerName:'Rollback QA',customerPhone:'0000000000',customerEmail:'qa@example.invalid',totalAmount:100000,paidAt:when}});
  const online=await tx.order.create({data:{number:numbers[1],sessionId:session.id,locationId:session.locationId,status:'PAID',source:'ONLINE',customerName:'Rollback QA',customerPhone:'0000000000',customerEmail:'qa@example.invalid',totalAmount:500000,paidAt:when}});
  const cash=await tx.payment.create({data:{orderId:offline.id,amount:100000,method:'CASH',status:'SUCCEEDED',succeededAt:when,provider:'MANUAL'}});
  const site=await tx.payment.create({data:{orderId:online.id,amount:500000,method:'CARD_ONLINE',status:'SUCCEEDED',succeededAt:when,provider:'YOOKASSA'}});
  await tx.refund.create({data:{orderId:offline.id,paymentId:cash.id,amount:20000,status:'COMPLETED',completedAt:when,createdAt:when}});
  await tx.refund.create({data:{orderId:online.id,paymentId:site.id,amount:30000,status:'COMPLETED',completedAt:when,createdAt:when}});
  await tx.parkOperation.create({data:{locationId:session.locationId,date:day,kind:'FEED_SALE',amountKopecks:30000,quantity:1,method:'CASH',createdBy:owner.id,note:'Private rollback QA'}});
  const expenseKinds=require('/app/.next/server/webpack-runtime.js')(3743).JD;assert.ok(Array.isArray(expenseKinds)&&expenseKinds.length);
  await tx.parkOperation.create({data:{locationId:session.locationId,date:day,kind:expenseKinds[0],amountKopecks:5000,quantity:1,method:'CASH',createdBy:owner.id,note:'Private rollback QA expense'}});
  const after=await finance(actor,params);
  const delta={tickets:after.revenue.tickets-before.revenue.tickets,feed:after.revenue.feed-before.revenue.feed,revenue:after.revenue.total-before.revenue.total,refunds:after.refunds.total-before.refunds.total,expenses:after.expenses.total-before.expenses.total,net:after.net-before.net};
  assert.deepEqual(delta,{tickets:100000,feed:30000,revenue:130000,refunds:20000,expenses:5000,net:105000});
  result={ok:true,database:identity.database,delta,onlinePaymentExcluded:500000,onlineRefundExcluded:30000,expenseKind:expenseKinds[0]};
  throw rollback;
 },{timeout:45000,isolationLevel:'Serializable'});}catch(error){if(error!==rollback)throw error;}finally{transactionOverride=null;}
 assert.equal(await db.order.count({where:{number:{in:numbers}}}),0);
 return {...result,rolledBack:true,committedFixtureOrders:0};
}
http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 if(!((req.method==='GET'&&req.url==='/qa')||(req.method==='POST'&&req.url==='/fixture-qa'))){res.writeHead(404);res.end('{"ok":false}');return;}
 try{res.end(JSON.stringify(req.url==='/fixture-qa'?await fixtureCheck():await check()));}
 catch(error){res.writeHead(500);res.end(JSON.stringify({ok:false,error:error.code||error.name||'QA_FAILED',message:String(error.message||'QA_FAILED').slice(0,250)}));}
}).listen(Number(env.PORT||8080),'0.0.0.0');
