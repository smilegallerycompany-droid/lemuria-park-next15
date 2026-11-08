"use strict";
// Existing private IAM-only container. No new auth grants or public endpoints.
const http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {PrismaClient,Prisma}=require('/app/node_modules/@prisma/client');
const env=process.env;
const url=env.DATABASE_URL||`postgresql://${encodeURIComponent(env.DB_USER)}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${env.DB_PORT||6432}/${env.DB_NAME}?sslmode=require&connection_limit=1&connect_timeout=10`;
const db=new PrismaClient({datasources:{db:{url}},log:[]});
const models=Prisma.dmmf.datamodel.models;
const model=name=>models.find(m=>m.name===name);
const delegate=name=>name[0].toLowerCase()+name.slice(1);
const json=x=>JSON.parse(JSON.stringify(x));
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
globalThis.fetch=async()=>{throw Error('OUTBOUND_NETWORK_DISABLED_IN_QA');};
async function identity(tx){const[r]=await tx.$queryRawUnsafe('SELECT current_database() AS name');assert.equal(r.name,env.QA_EXPECTED_DB);return r.name;}
async function collect(tx){
 assert.equal(await identity(tx),'lemuria');
 const candidates=await tx.cashierShift.findMany({where:{status:'OPEN',OR:[{openedAt:{gte:new Date('2026-09-17T00:00:00Z'),lt:new Date('2026-09-18T00:00:00Z')},location:{slug:'volgograd'}},{openedAt:{gte:new Date('2026-10-22T00:00:00Z'),lt:new Date('2026-10-23T00:00:00Z')},location:{slug:'saratov'}}]},orderBy:{id:'asc'}});
 assert.equal(candidates.length,3,'Exactly the three owner-identified test shifts required');
 const days=candidates.map(s=>s.openedAt.toISOString().slice(0,10));assert.equal(days.filter(d=>d==='2026-09-17').length,2);assert.equal(days.filter(d=>d==='2026-10-22').length,1);
 for(const s of candidates){assert.equal(s.closedAt,null);for(const f of ['cashSalesAmount','cardSalesAmount','onlineSalesAmount','cashRefundsAmount','ordersCount','ticketsCount'])assert.equal(s[f],0,'Nonzero sales prohibit deletion: '+f);}
 const ids=candidates.map(s=>s.id),tables={CashierShift:candidates};
 for(const m of models){if(m.name==='CashierShift')continue;const rel=m.fields.find(f=>f.kind==='object'&&f.type==='CashierShift'&&f.relationFromFields?.length);if(!rel)continue;assert.equal(rel.relationFromFields.length,1);const rows=await tx[delegate(m.name)].findMany({where:{[rel.relationFromFields[0]]:{in:ids}},orderBy:{id:'asc'}});if(rows.length){assert.ok(['CashOperation','ParkOperation'].includes(m.name),'Sales/unknown relation prohibits deletion: '+m.name);tables[m.name]=rows;}}
 for(const row of tables.CashOperation||[]){assert.equal(row.type,'OPENING');assert.equal(row.orderId,null);assert.equal(row.parkOperationId,null);}
 for(const row of tables.ParkOperation||[]){assert.equal(row.amountKopecks,0);assert.ok(!/SALE|SALARY|ADVANCE|EXPENSE|PAYOUT/.test(row.kind),'Monetary report entry prohibits deletion');}
 const parkIds=(tables.ParkOperation||[]).map(r=>r.id);
 if(parkIds.length)for(const m of models){const rel=m.fields.find(f=>f.kind==='object'&&f.type==='ParkOperation'&&f.relationFromFields?.length);if(!rel)continue;const count=await tx[delegate(m.name)].count({where:{[rel.relationFromFields[0]]:{in:parkIds}}});assert.equal(count,0,'Report attachment or cash relation prohibits deletion');}
 const archive=json({version:1,tables});return {archive,planHash:hash(archive),ids,counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length]))};
}
async function readiness(){return db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20000ms'");const p=await collect(tx);return{ok:true,planHash:p.planHash,counts:p.counts,saleRelatedRecords:0,archive:p.archive};},{timeout:30000,isolationLevel:'RepeatableRead'});}
async function removeTestShifts(body){
 assert.equal(env.QA_ALLOW_TEST_SHIFT_DELETE,'1');assert.equal(env.QA_EXPECTED_DB,'lemuria');assert.match(body.planHash||'',/^[a-f0-9]{64}$/);
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20000ms'");
  const p=await collect(tx);
  await tx.$queryRawUnsafe('SELECT id FROM "CashierShift" WHERE id IN ($1,$2,$3) FOR UPDATE',...p.ids);
  const locked=await collect(tx);assert.equal(locked.planHash,body.planHash,'State changed since review');
  const backup=await tx.auditLog.create({data:{action:'OWNER_CONFIRMED_TEST_SHIFTS_REMOVED',entityType:'CashierShift',entityId:'confirmed-test-shifts-20261107',before:locked.archive,after:{removedShiftIds:locked.ids},metadata:{reason:'Owner explicitly identified these three old shifts as test data and requested removal',planHash:locked.planHash,restorable:true,productionOrdersChanged:0}}});
  if(locked.archive.tables.CashOperation?.length)assert.equal((await tx.cashOperation.deleteMany({where:{id:{in:locked.archive.tables.CashOperation.map(r=>r.id)}}})).count,locked.archive.tables.CashOperation.length);
  if(locked.archive.tables.ParkOperation?.length)assert.equal((await tx.parkOperation.deleteMany({where:{id:{in:locked.archive.tables.ParkOperation.map(r=>r.id)}}})).count,locked.archive.tables.ParkOperation.length);
  assert.equal((await tx.cashierShift.deleteMany({where:{id:{in:locked.ids},status:'OPEN'}})).count,3);
  assert.equal(await tx.cashierShift.count({where:{id:{in:locked.ids}}}),0);
  return {ok:true,removedShifts:3,backupAuditId:backup.id,restorable:true,productionOrdersChanged:0,counts:locked.counts};
 },{timeout:40000,isolationLevel:'Serializable'});
}
function restoreData(name,row){const fields=model(name).fields;return Object.fromEntries(Object.entries(row).map(([k,v])=>{const f=fields.find(f=>f.name===k);assert.ok(f&&f.kind!=='object');return[k,f.type==='DateTime'&&v!==null?new Date(v):f.type==='Json'&&v===null?Prisma.DbNull:v];}));}
async function restore(body){
 assert.equal(env.QA_ALLOW_TEST_SHIFT_DELETE,'1');assert.equal(env.QA_EXPECTED_DB,'lemuria');assert.ok(body.auditId);
 return db.$transaction(async tx=>{await identity(tx);const a=await tx.auditLog.findUnique({where:{id:body.auditId}});assert.equal(a.action,'OWNER_CONFIRMED_TEST_SHIFTS_REMOVED');assert.equal(hash(a.before),a.metadata.planHash);const tables=a.before.tables;const ids=tables.CashierShift.map(r=>r.id);assert.equal(await tx.cashierShift.count({where:{id:{in:ids}}}),0);for(const name of ['CashierShift','ParkOperation','CashOperation'])for(const row of tables[name]||[])await tx[delegate(name)].create({data:restoreData(name,row)});await tx.auditLog.create({data:{action:'TEST_SHIFTS_RESTORED_FROM_ARCHIVE',entityType:'CashierShift',entityId:body.auditId,metadata:{restoredShifts:3}}});return{ok:true,restoredShifts:3};},{timeout:40000,isolationLevel:'Serializable'});
}
async function financeFixtures(){assert.equal(await identity(db),'lemuria_staging');assert.equal(env.QA_ALLOW_ROLLBACK_FIXTURES,'1');return require('/app/crm-finance-fixture.cjs').fixtureCheck();}
module.exports={collect,readiness,removeTestShifts,restore,hash};
if(require.main===module)http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 try{
  let body={};if(req.method==='POST'){let s='';for await(const c of req){s+=c;assert.ok(s.length<2048);}body=JSON.parse(s||'{}');}
  let result;
  if(req.method==='GET'&&req.url==='/readiness')result=await readiness();
  else if(req.method==='POST'&&req.url==='/remove-test-shifts')result=await removeTestShifts(body);
  else if(req.method==='POST'&&req.url==='/restore-test-shifts')result=await restore(body);
  else if(req.method==='POST'&&req.url==='/fixtures')result=await financeFixtures();
  else if(req.method==='GET'&&req.url==='/scope-qa'){assert.equal(await identity(db),'lemuria_staging');result=await require('/app/crm-finance-fixture.cjs').check();}
  else if(req.method==='GET'&&req.url==='/policy'){result=JSON.parse(require('node:child_process').execFileSync(process.execPath,['/app/check-live-staff-policy.cjs','/app'],{encoding:'utf8'}));}
  else{res.writeHead(404);res.end('{"ok":false}');return;}
  res.end(JSON.stringify(result));
 }catch(e){res.writeHead(500);res.end(JSON.stringify({ok:false,error:e.code||e.name,message:String(e.message).slice(0,200)}));}
}).listen(Number(env.PORT||8080),'0.0.0.0');
