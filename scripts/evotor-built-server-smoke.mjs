/** Local isolated acceptance of the built Next server. No physical terminal calls. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash, randomUUID, randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {openSync, closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
const overlay=process.env.EVOTOR_OVERLAY_APP;
const require=createRequire(overlay ? resolve(overlay,'server.js') : import.meta.url);
const {PrismaClient}=require('@prisma/client');
const url=new URL(process.env.DATABASE_URL);
assert.equal(url.hostname,'127.0.0.1','Local isolated database only');
assert.equal(url.port,'55439');
assert.ok(['/postgres','/evotor_http_test'].includes(url.pathname));
const db=new PrismaClient();
const run=randomUUID(), token=randomBytes(32).toString('hex'), secret=randomBytes(32).toString('hex');
const staffToken=randomBytes(32).toString('hex');
const base='http://127.0.0.1:3309';
let child;
const logPath=resolve(tmpdir(),'lemuria-evotor-http-'+run+'.log');
const log=openSync(logPath,'wx',0o600);
try {
 const loc=await db.location.create({data:{slug:'http-'+run,name:'HTTP TEST',city:'Test',address:'Test',status:'ACTIVE',timezone:'Europe/Saratov'}});
 const user=await db.user.create({data:{email:run+'@example.invalid',name:'HTTP TEST',passwordHash:'not-a-login',role:'CASHIER',status:'ACTIVE',locations:{create:{locationId:loc.id}}}});
 await db.staffSession.create({data:{userId:user.id,tokenHash:createHash('sha256').update(secret+':'+staffToken).digest('hex'),expiresAt:new Date(Date.now()+3600000)}});
 const shift=await db.cashierShift.create({data:{userId:user.id,locationId:loc.id,openingCashAmount:0,status:'OPEN'}});
 const type=await db.ticketType.upsert({where:{code:'ADULT'},update:{},create:{code:'ADULT',name:'Взрослый'}});
 if(overlay) await db.cashierExtra.upsert({where:{code:'FEED'},update:{unitPriceAmount:30000,isActive:true},create:{code:'FEED',name:'Корм',unitPriceAmount:30000}});
 await db.priceRule.createMany({data:['WEEKDAY','WEEKEND'].map(dayType=>({locationId:loc.id,ticketTypeId:type.id,dayType,priceAmount:90000,validFrom:new Date('2020-01-01')}))});
 const session=await db.session.create({data:{locationId:loc.id,startsAt:new Date(Date.now()+300000),endsAt:new Date(Date.now()+1500000),capacity:15,status:'SCHEDULED'}});
 child=spawn(process.execPath,overlay?['server.js']:['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3309'],{cwd:overlay||process.cwd(),stdio:['ignore',log,log],env:{...process.env,PORT:'3309',HOSTNAME:'127.0.0.1',NODE_ENV:'production',NEXT_PUBLIC_APP_URL:base,AUTH_SECRET:secret,QR_SIGNING_SECRET:secret,CRON_SECRET:secret,APP_ENV:'staging',ALLOWED_HOSTS:'127.0.0.1,localhost',EMAIL_PROVIDER:'none',YUKASSA_SHOP_ID:'',YUKASSA_SECRET_KEY:'',EVOTOR_TERMINALS_JSON:JSON.stringify([{id:'simulated-'+run,locationId:loc.id,tokenHash:createHash('sha256').update(token).digest('hex')}])}});
 for(let i=0;i<40;i++){try{if((await fetch(base+'/api/health/live')).ok)break;}catch{} await new Promise(r=>setTimeout(r,250));}
 async function call(path,body,headers={}){const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,body:await res.json()};}
 const staff={cookie:'lemuria_staff_session='+staffToken};
 const terminal={authorization:'Bearer '+token};
 assert.equal((await call('/api/integrations/evotor/checkout',{action:'claim',claimId:randomUUID()})).status,401);
 assert.equal((await call('/api/cashier/sales/status?number=absent')).status,401);
 let proofs=0;
 for(const [method,outcome] of [['CASH','FISCALIZED'],['CARD_TERMINAL','FISCALIZED'],['CARD_TERMINAL','DECLINED'],['CARD_TERMINAL','UNKNOWN']]) {
  const key=randomUUID(), cash=method==='CASH', extra=overlay&&cash, amount=extra?120000:90000;
  const basket={sessionPublicId:session.publicId,items:[{ticketTypeCode:'ADULT',quantity:1}],...(extra?{extras:[{code:'FEED',quantity:1}]}:{})};
  const input={...basket,paymentMethod:method,...(cash?{cashReceived:amount+10000}:{})};
  if(overlay){
   const quote=await call('/api/cashier/quote',basket,staff);
   assert.equal(quote.status,200,JSON.stringify(quote));
   assert.equal(quote.body.data.totalAmount,amount);
   input.quoteFingerprint=quote.body.data.fingerprint;
   assert.equal(typeof input.quoteFingerprint,'string');
  }
  const sale=await call('/api/cashier/sales',input,{...staff,'Idempotency-Key':key});
  assert.equal(sale.status,201,JSON.stringify(sale)); assert.equal(sale.body.data.status,'AWAITING_PAYMENT');
  const repeat=await call('/api/cashier/sales',input,{...staff,'Idempotency-Key':key}); assert.equal(repeat.body.data.number,sale.body.data.number);
  const claimId=randomUUID();const claim=await call('/api/integrations/evotor/checkout',{action:'claim',claimId},terminal);
  assert.equal(claim.status,200,JSON.stringify(claim));const job=claim.body.data.sale;assert.equal(job.totalAmount,amount);
  if(cash){assert.equal(job.cashReceived,amount+10000);assert.equal(job.changeAmount,10000);}
  if(extra) assert.equal(job.items.length,2);
  const recovery=await call('/api/integrations/evotor/checkout',{action:'claim',claimId},terminal);assert.equal(recovery.body.data.sale.id,job.id);
  const result={requestId:job.id,outcome,...(outcome==='FISCALIZED'?{amount,paymentMethod:method,receipt:{serial:'1234567890123456',documentNumber:String(Date.now()+proofs++).slice(-9),fiscalSign:'123'}}:{})};
  const ack=await call('/api/integrations/evotor/checkout',{action:'result',result},terminal);assert.equal(ack.status,200,JSON.stringify(ack));
  assert.equal((await call('/api/integrations/evotor/checkout',{action:'result',result},terminal)).status,200);
  const status=await call('/api/cashier/sales/status?number='+sale.body.data.number,undefined,staff);
  assert.equal(status.body.data.status,outcome==='FISCALIZED'?'PAID':outcome==='DECLINED'?'CANCELLED':'AWAITING_PAYMENT');
  console.log(method+' '+outcome+': HTTP create/retry/claim/recovery/result/status OK');
 }
 const totals=await db.cashierShift.findUniqueOrThrow({where:{id:shift.id}});
 assert.equal(totals.cashSalesAmount,overlay?120000:90000);assert.equal(totals.cardSalesAmount,90000);assert.equal(totals.ticketsCount,2);
 assert.equal(await db.ticket.count({where:{order:{shiftId:shift.id}}}),2);
 console.log('PASS: real HTTP routes, isolated database, simulated terminal; exactly 2 paid sales / 2 tickets');
} catch (error) {
 console.error('HTTP server log:',logPath);
 throw error;
} finally {
 if(child?.exitCode===null&&child.signalCode===null){
  child.kill('SIGTERM');
  await new Promise(resolve=>child.once('exit',resolve));
 }
 closeSync(log);await db.$disconnect();
}
