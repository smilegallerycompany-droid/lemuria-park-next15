"use strict";
// Private IAM-only acceptance probe. No app startup, passwords or writes.
const http=require('node:http');
const assert=require('node:assert/strict');
const {PrismaClient}=require('/app/node_modules/@prisma/client');
const env=process.env;
const url=env.DATABASE_URL||`postgresql://${encodeURIComponent(env.DB_USER)}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${env.DB_PORT||6432}/${env.DB_NAME}?sslmode=require&connection_limit=1&connect_timeout=10`;
process.env.DATABASE_URL=url;
const db=new PrismaClient({datasources:{db:{url}},log:[]});
const trace={};
globalThis.prisma=new Proxy(db,{get(target,key){
 if(key==='$transaction')return (callback,options)=>target.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20000ms'");
  const observed=new Proxy(tx,{get(t,model){
   if(model==='payment'||model==='refund')return new Proxy(t[model],{get(table,method){
    const original=table[method];
    if(typeof original!=='function')return original;
    return function(args){if((model==='payment'&&method==='groupBy')||(model==='refund'&&method==='findMany'))trace[model]=args;return original.call(table,args);};
   }});
   return t[model];
  }});
  return callback(observed);
 },options);
 const value=target[key];return typeof value==='function'?value.bind(target):value;
}});
let finance;
async function check(){
 const [identity]=await db.$queryRawUnsafe('SELECT current_database() AS database');
 assert.equal(identity.database,env.QA_EXPECTED_DB);
 assert.ok(['lemuria_staging','lemuria'].includes(identity.database));
 if(!finance){
  require('/app/.next/server/app/api/director/finance/route.js');
  const webpack=require('/app/.next/server/webpack-runtime.js');
  finance=webpack(60664).n;
  assert.equal(typeof finance,'function');
 }
 const day=env.QA_DAY||new Date().toISOString().slice(0,10);
 const actor={id:'private-readonly-qa',role:'OWNER',status:'ACTIVE',readOnly:true,locations:[]};
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
http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'||req.url!=='/qa'){res.writeHead(404);res.end('{"ok":false}');return;}
 try{res.end(JSON.stringify(await check()));}
 catch(error){res.writeHead(500);res.end(JSON.stringify({ok:false,error:error.code||error.name||'QA_FAILED',message:String(error.message||'QA_FAILED').slice(0,250)}));}
}).listen(Number(env.PORT||8080),'0.0.0.0');
