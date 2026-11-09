"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const policy=require('../src/server/services/invitation-policy.cjs');
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

async function fixture(){
 const pg=new PGlite();
 await pg.exec(`CREATE TABLE "AuditLog" ("id" text PRIMARY KEY,"actorId" text,"action" text,"entityType" text,"entityId" text,"metadata" jsonb,"createdAt" timestamptz DEFAULT now()); CREATE TABLE "Location" (id text PRIMARY KEY,slug text,status text,name text,timezone text); CREATE TABLE "User" (id text PRIMARY KEY,role text,status text); INSERT INTO "Location" VALUES ('saratov','saratov','ACTIVE','Лемурия Саратов','Europe/Saratov'); INSERT INTO "User" VALUES ('issuer','OWNER','ACTIVE');`);
 let queue=Promise.resolve();
 const one=async(sql,args=[]) => (await pg.query(sql,args)).rows[0] || null;
 const tx={
  $queryRaw:async(strings,...args)=>{let sql='';strings.forEach((s,i)=>sql+=s+(i<args.length?'$'+(i+1):''));return(await pg.query(sql,args)).rows;},
  auditLog:{
   findUnique:({where})=>one('SELECT * FROM "AuditLog" WHERE id=$1',[where.id]),
   findFirst:({where})=>one('SELECT * FROM "AuditLog" WHERE "entityType"=$1 AND "entityId"=$2 AND action=$3 LIMIT 1',[where.entityType,where.entityId,where.action]),
   create:({data:d})=>one('INSERT INTO "AuditLog" (id,"actorId",action,"entityType","entityId",metadata,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',[d.id||require('node:crypto').randomUUID(),d.actorId,d.action,d.entityType,d.entityId,JSON.stringify(d.metadata),d.createdAt||new Date()]),
  },
  location:{findUnique:({where})=>one('SELECT * FROM "Location" WHERE id=$1',[where.id])},
  user:{findUnique:({where})=>one('SELECT * FROM "User" WHERE id=$1',[where.id])},
 };
 const db={$transaction:fn=>{const call=queue.then(async()=>{await pg.exec('BEGIN');try{const out=await fn(tx);await pg.exec('COMMIT');return out;}catch(e){await pg.exec('ROLLBACK');throw e;}});queue=call.catch(()=>{});return call;}};
 const tokens=Array.from({length:10},()=>policy.newToken());
 const batch={batch:'LP-WD-20261109',locationId:'saratov',actorId:'issuer',invitations:tokens.map((token,i)=>({number:`LP-WD-261109-${String(i+1).padStart(3,'0')}`,tokenHash:policy.hashToken(token)}))};
 await policy.issueBatch(db,batch);
 return {pg,db,batch,tokens,scan:(index,now='2026-11-09T08:00:00Z',extra={})=>policy.checkInInvitation(db,{qrToken:tokens[index],cashierId:'scanner',allowedLocationIds:['saratov'],...extra},{now:new Date(now)})};
}

test('ten invitations are issued without orders or payments; retry is idempotent',async()=>{const f=await fixture();try{const again=await policy.issueBatch(f.db,f.batch);assert.equal(again.created,0);assert.equal((await f.pg.query('SELECT count(*)::int n FROM "AuditLog" WHERE action=\'INVITATION_ISSUED\'')).rows[0].n,10);assert.equal((await f.pg.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_name IN ('Order','Payment','Ticket')")).rows[0].n,0);}finally{await f.pg.close();}});
test('weekday first scan succeeds and second scan returns ALREADY_USED',async()=>{const f=await fixture();try{const a=await f.scan(0),b=await f.scan(0);assert.equal(a.result,'SUCCESS');assert.equal(a.ticket.status,'USED');assert.equal(b.result,'ALREADY_USED');assert.equal(a.ticket.usedAt,b.ticket.usedAt);assert.equal((await f.pg.query('SELECT count(*)::int n FROM "AuditLog" WHERE action=\'INVITATION_CHECK_IN\'')).rows[0].n,1);}finally{await f.pg.close();}});
test('parallel scans produce one successful admission',async()=>{const f=await fixture();try{const results=await Promise.all(Array.from({length:8},()=>f.scan(1)));assert.equal(results.filter(x=>x.result==='SUCCESS').length,1);assert.equal(results.filter(x=>x.result==='ALREADY_USED').length,7);}finally{await f.pg.close();}});
test('Saturday and Sunday refuse admission without consuming the ticket',async()=>{const f=await fixture();try{assert.equal((await f.scan(2,'2026-11-14T08:00:00Z')).result,'WRONG_DATE');assert.equal((await f.scan(2,'2026-11-15T08:00:00Z')).result,'WRONG_DATE');assert.equal((await f.scan(2,'2026-11-16T08:00:00Z')).result,'SUCCESS');}finally{await f.pg.close();}});
test('weekday boundary uses Saratov time, including midnight',async()=>{const f=await fixture();try{assert.equal((await f.scan(3,'2026-11-13T19:59:59Z')).result,'SUCCESS');assert.equal((await f.scan(4,'2026-11-13T20:00:00Z')).result,'WRONG_DATE');assert.equal((await f.scan(4,'2026-11-15T20:00:00Z')).result,'SUCCESS');}finally{await f.pg.close();}});
test('wrong location refuses admission without consuming ticket',async()=>{const f=await fixture();try{assert.equal((await f.scan(5,undefined,{allowedLocationIds:['volgograd']})).result,'WRONG_LOCATION');assert.equal((await f.scan(5)).result,'SUCCESS');}finally{await f.pg.close();}});
test('forged and malformed invitation codes are rejected',async()=>{const f=await fixture();try{for(const qrToken of [policy.newToken(),'LPINV1-bad'])assert.equal((await policy.checkInInvitation(f.db,{qrToken,cashierId:'scanner'})).result,'INVALID');}finally{await f.pg.close();}});
test('ordinary paid tickets bypass invitation storage entirely',async()=>{assert.equal(await policy.checkInInvitation({$transaction:()=>{throw Error('must not query')}},{qrToken:'existing-paid-qr',cashierId:'scanner'}),null);});
test('cancelled invitation is refused',async()=>{const f=await fixture();try{const hash=policy.hashToken(f.tokens[6]);await f.pg.query('INSERT INTO "AuditLog" (id,action,"entityType") VALUES ($1,$2,$3)',[policy.key('cancel',hash),'INVITATION_CANCELLED',policy.TYPE]);assert.equal((await f.scan(6)).result,'CANCELLED');}finally{await f.pg.close();}});
test('issuance is all-or-nothing on a conflicting number',async()=>{const f=await fixture();try{const other={...f.batch,invitations:f.batch.invitations.map((x,i)=>({...x,tokenHash:policy.hashToken(policy.newToken()),number:i===0?'LP-WD-261109-011':x.number}))};await assert.rejects(policy.issueBatch(f.db,other),/NUMBER_CONFLICT/);assert.equal((await f.pg.query('SELECT count(*)::int n FROM "AuditLog" WHERE action=\'INVITATION_ISSUED\'')).rows[0].n,10);}finally{await f.pg.close();}});
