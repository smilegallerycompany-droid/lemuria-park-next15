'use strict';
// IAM-private, one-off registration. Active QR values are supplied in the
// request body from a private file; never put them in source or image layers.
require('/app/container-bootstrap.cjs').applyDatabaseUrlFromEnv(process.env);
const url=new URL(process.env.DATABASE_URL);
if(url.port==='6432')url.searchParams.set('pgbouncer','true');
url.searchParams.set('connection_limit','1');process.env.DATABASE_URL=url.toString();
const http=require('node:http'),assert=require('node:assert/strict');
const {PrismaClient}=require('/app/node_modules/@prisma/client');
const db=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL}}});
const p=require('/app/invitation-policy.cjs');
async function run(input,verifyOnly){
 assert.equal(process.env.APP_ENV,'production');
 assert.equal(input.batch,'private-printed-lemuria-20261110');
 assert.ok(Array.isArray(input.numbers)&&input.numbers.length===10);
 assert.equal(new Set(input.numbers).size,10);
 input.numbers.forEach((n,i)=>assert.match(n,new RegExp('^LP-'+String(i+1).padStart(2,'0')+'-[A-F0-9]{6}$')));
 assert.ok(Array.isArray(input.retiredHashes)&&input.retiredHashes.length===10);
 input.retiredHashes.forEach(x=>assert.match(x,/^[a-f0-9]{64}$/));
 const location=await db.location.findUnique({where:{slug:'saratov'}});
 const actor=await db.user.findFirst({where:{role:{in:['OWNER','DIRECTOR','ADMIN']},status:'ACTIVE'},orderBy:{createdAt:'asc'}});
 assert.ok(location&&actor);
 const items=input.numbers.map(number=>({number,tokenHash:p.hashToken(number)}));
 if(!verifyOnly){
  for(const hash of input.retiredHashes){
   const event=await db.auditLog.findUnique({where:{id:p.key('issue',hash)}});
   assert.ok(p.validIssue(event,hash));assert.equal(event.metadata.batch,'printed-lemuria-10-20261109');
   assert.equal(await db.auditLog.count({where:{id:p.key('use',hash)}}),0);
  }
  await p.issueBatch(db,{batch:input.batch,locationId:location.id,actorId:actor.id,invitations:items});
  await db.$transaction(async tx=>{
   for(const hash of input.retiredHashes)await tx.auditLog.upsert({where:{id:p.key('cancel',hash)},create:{id:p.key('cancel',hash),actorId:actor.id,action:'INVITATION_CANCELLED',entityType:p.TYPE,metadata:{reason:'Replaced with private QR batch',replacementBatch:input.batch}},update:{}});
  });
 }
 for(const item of items){
  const event=await db.auditLog.findUnique({where:{id:p.key('issue',item.tokenHash)}});
  assert.ok(p.validIssue(event,item.tokenHash));assert.equal(event.metadata.batch,input.batch);
  assert.equal(await db.auditLog.count({where:{id:p.key('cancel',item.tokenHash)}}),0);
 }
 const used=await db.auditLog.count({where:{id:{in:items.map(x=>p.key('use',x.tokenHash))}}});
 const retired=await db.auditLog.count({where:{id:{in:input.retiredHashes.map(x=>p.key('cancel',x))}}});
 assert.equal(retired,10);
 return {ok:true,registered:10,used,retired:10,batch:input.batch};
}
http.createServer(async(req,res)=>{
 try{
  assert.equal(req.method,'POST');assert.ok(['/replace','/verify'].includes(req.url));
  let body='';for await(const part of req){body+=part;if(body.length>16000)throw Error('BODY_TOO_LARGE');}
  const result=await run(JSON.parse(body),req.url==='/verify');
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));
 }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:e.code||e.name}));}
}).listen(process.env.PORT||8080);
