'use strict';
const http=require('node:http'),assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const p=require('/app/invitation-policy.cjs'),db=new PrismaClient();
const numbers=['LP-01-374390','LP-02-FDEAD0','LP-03-B0A78A','LP-04-F30BE1','LP-05-EC07F2','LP-06-43A01F','LP-07-DAAFB8','LP-08-8CB5D4','LP-09-0A53F9','LP-10-9638B3'];
async function context(){
 const location=await db.location.findUnique({where:{slug:'saratov'}});
 const actor=await db.user.findFirst({where:{role:{in:['OWNER','DIRECTOR','ADMIN']},status:'ACTIVE'},orderBy:{createdAt:'asc'}});
 assert.ok(location&&actor);return {locationId:location.id,actorId:actor.id};
}
async function issue(){
 assert.equal(process.env.APP_ENV,'production');
 const ctx=await context();
 const result=await p.issueBatch(db,{...ctx,batch:'printed-lemuria-10-20261109',invitations:numbers.map(number=>({number,tokenHash:p.hashToken(number)}))});
 const events=await db.auditLog.findMany({where:{id:{in:numbers.map(n=>p.key('issue',p.hashToken(n)))}}});
 assert.equal(events.length,10);
 const uses=await db.auditLog.count({where:{id:{in:numbers.map(n=>p.key('use',p.hashToken(n)))}}});
 return {...result,registered:events.length,used:uses,numbers};
}
async function stage(){
 assert.equal(process.env.APP_ENV,'staging');const [database]=await db.$queryRawUnsafe('SELECT current_database() AS name');assert.equal(database.name,'lemuria_staging');
 const ctx=await context(),tokens=Array.from({length:10},()=>p.newToken());
 const batch='qa-invites-'+Date.now();
 await p.issueBatch(db,{...ctx,batch,invitations:tokens.map((t,i)=>({number:`LP-WD-261109-${String(100+i).padStart(3,'0')}`,tokenHash:p.hashToken(t)}))});
 const scan=(i,date='2026-11-11T08:00:00Z',scope=[ctx.locationId])=>p.checkInInvitation(db,{qrToken:tokens[i],cashierId:ctx.actorId,allowedLocationIds:scope},{now:new Date(date)});
 const results=await Promise.all(Array.from({length:8},()=>scan(0)));
 assert.equal(results.filter(x=>x.result==='SUCCESS').length,1);assert.equal(results.filter(x=>x.result==='ALREADY_USED').length,7);
 assert.equal((await scan(1,'2026-11-10T08:00:00Z')).result,'WRONG_DATE');
 assert.equal((await scan(1,'2026-11-14T08:00:00Z')).result,'WRONG_DATE');
 assert.equal((await scan(1,'2026-12-21T08:00:00Z')).result,'EXPIRED');
 assert.equal((await scan(1,undefined,['other'])).result,'WRONG_LOCATION');
 assert.equal((await scan(1)).result,'SUCCESS');
 assert.equal(await p.checkInInvitation(db,{qrToken:'ordinary-paid-token',cashierId:ctx.actorId}),null);
 const crypto=require('node:crypto'),password=crypto.randomBytes(32).toString('base64url');
 const account=await db.user.create({data:{name:'Synthetic invitation scanner',email:`qa-invitation-${crypto.randomUUID()}@example.invalid`,passwordHash:await require('bcryptjs').hash(password,12),role:'CASHIER',status:'ACTIVE',locations:{create:{locationId:ctx.locationId}}}});
 let apiResult;
 try{
  const origin='https://d5d9sorlbdsebnpfr97f.0ly8ed4d.apigw.yandexcloud.net';
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({email:account.email,password,portal:'cashier'})});assert.equal(login.status,200);
  const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  const response=await fetch(origin+'/api/cashier/check-in',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify({qrToken:tokens[3]})});assert.equal(response.status,200);
  apiResult=(await response.json()).data.result;
  const day=p.localDay(new Date(),'Europe/Saratov');assert.equal(apiResult,!day.allowed||day.weekday==='Tue'?'WRONG_DATE':'SUCCESS');
 }finally{await db.user.update({where:{id:account.id},data:{status:'DISABLED'}});await db.staffSession.updateMany({where:{userId:account.id},data:{revokedAt:new Date()}});}
 for(const token of tokens)await db.auditLog.create({data:{id:p.key('cancel',p.hashToken(token)),actorId:ctx.actorId,action:'INVITATION_CANCELLED',entityType:p.TYPE,metadata:{batch,reason:'staging acceptance complete'}}});
 assert.equal((await scan(2)).result,'CANCELLED');
 return {ok:true,parallelSuccess:1,parallelDuplicates:7,tuesdayDenied:true,weekendDenied:true,expiryDenied:true,scopeDenied:true,ordinaryBypass:true,authenticatedApiResult:apiResult,fixturesCancelled:10};
}
http.createServer(async(req,res)=>{try{
 let result;
 if(req.url==='/health')result={ok:true,environment:process.env.APP_ENV};
 else if(req.method==='POST'&&req.url==='/stage')result=await stage();
 else if(req.method==='POST'&&req.url==='/issue')result=await issue();
 else {res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));
}catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:e.message}));}}).listen(process.env.PORT||8080);
