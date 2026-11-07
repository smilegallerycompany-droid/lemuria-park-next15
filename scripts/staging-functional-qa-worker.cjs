"use strict";
// Private IAM-only acceptance worker. Synthetic records in lemuria_staging only.
// Passwords/cookies are generated and consumed inside the worker, never returned.
const http=require('node:http'),fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {PrismaClient,Prisma}=require('/app/node_modules/@prisma/client');
const db=new PrismaClient({log:[]});
const ORIGIN='https://d5d9sorlbdsebnpfr97f.0ly8ed4d.apigw.yandexcloud.net';
async function guard(){assert.equal(process.env.APP_ENV,'staging');const[r]=await db.$queryRawUnsafe('SELECT current_database() AS name');assert.equal(r.name,'lemuria_staging');}
const model=n=>Prisma.dmmf.datamodel.models.find(x=>x.name===n);
async function inventory(){await guard();const source=fs.readFileSync('/app/.next/server/app/api/auth/login/route.js','utf8');const key=process.env.YUKASSA_SECRET_KEY||process.env.YOOKASSA_SECRET_KEY;return{ok:true,database:'lemuria_staging',portalContract:source.match(/.{0,100}portal.{0,400}/g),providerSecretBound:!!key,providerTestKey:!!key?.startsWith('test_'),activeSyntheticAccounts:await db.user.count({where:{email:{startsWith:'qa-',endsWith:'@example.invalid'},status:'ACTIVE'}})};}
async function request(path,{cookie,body}={}){assert.ok(path.startsWith('/api/'));const r=await fetch(ORIGIN+path,{method:body?'POST':'GET',redirect:'manual',headers:{'Content-Type':'application/json',Origin:ORIGIN,...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});const data=await r.json().catch(()=>({}));return{status:r.status,data,cookie:r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')};}
async function test(){
 await guard();const suffix=crypto.randomUUID(),userIds=[],orderIds=[],sessionIds=[],ticketIds=[],shiftIds=[],results=[];
 const roles=['CASHIER','ADMIN','DIRECTOR','OWNER','ONLINE_MANAGER'];const cookies={};
 const active=await db.location.findFirst({where:{slug:'saratov',status:'ACTIVE'}});assert.ok(active);
 const foreign=await db.location.findFirst({where:{id:{not:active.id},status:'ACTIVE'}});assert.ok(foreign);
 const type=await db.ticketType.findFirst();assert.ok(type);
 try{
  for(const role of roles){
   const password=crypto.randomBytes(32).toString('base64url');
   const user=await db.user.create({data:{name:'Synthetic role acceptance',email:`qa-${role.toLowerCase()}-${suffix}@example.invalid`,passwordHash:await require('/app/node_modules/bcryptjs').hash(password,12),role,status:'ACTIVE',locations:{create:{locationId:active.id}}}});userIds.push(user.id);
   const portal=role==='CASHIER'?'cashier':role==='ADMIN'?'admin':role==='ONLINE_MANAGER'?'online':'director';
   const login=await request('/api/auth/login',{body:{email:user.email,password,portal}});
   const ok=login.status===200&&login.data?.data?.role===role&&!!login.cookie;
   results.push({test:'separate_login',role,status:login.status,ok});if(!ok)continue;
   cookies[role]=login.cookie;
   const me=await request('/api/auth/me',{cookie:login.cookie});results.push({test:'authenticated_identity',role,status:me.status,ok:me.status===200&&me.data?.data?.role===role});
   const finance=await request('/api/director/finance?from=2026-11-07&to=2026-11-07',{cookie:login.cookie});const allowed=['OWNER','DIRECTOR','ADMIN'].includes(role);results.push({test:'finance_permission',role,status:finance.status,ok:allowed?finance.status===200:[401,403].includes(finance.status)});
  }
  assert.ok(cookies.CASHIER,'Cashier login required for QR acceptance');const cashierId=userIds[0];
  const shift=await db.cashierShift.create({data:{userId:cashierId,locationId:active.id,openingCashAmount:0,status:'OPEN',notes:'Synthetic staging QR acceptance'}});shiftIds.push(shift.id);
  async function session(location,days){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:location.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));const noon=new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);noon.setUTCDate(noon.getUTCDate()+days);noon.setUTCSeconds(crypto.randomInt(1,59),crypto.randomInt(1,999));const s=await db.session.create({data:{locationId:location.id,startsAt:noon,endsAt:new Date(noon.getTime()+1200000),capacity:15,status:'SCHEDULED'}});sessionIds.push(s.id);return s;}
  const today=await session(active,0),wrong=await session(active,3),other=await session(foreign,0);
  async function ticket(label,s,status){const o=await db.order.create({data:{number:'QA-QR-'+label+'-'+suffix,locationId:s.locationId,sessionId:s.id,status:status==='REFUNDED'?'REFUNDED':status==='CANCELLED'?'CANCELLED':'PAID',source:'CASHIER',totalAmount:0,customerName:'Synthetic staging QA',customerEmail:'qa@example.invalid',customerPhone:'0000000000',cashierId,items:{create:{ticketTypeId:type.id,ticketTypeName:type.name,quantity:1,unitPriceAmount:0,subtotalAmount:0}}},include:{items:true}});orderIds.push(o.id);const t=await db.ticket.create({data:{orderId:o.id,orderItemId:o.items[0].id,sessionId:s.id,ticketTypeId:type.id,qrToken:'qa-qr-'+crypto.randomBytes(24).toString('hex'),status,usedAt:status==='USED'?new Date():null}});ticketIds.push(t.id);return t.qrToken;}
  async function scan(label,token,expected){const r=await request('/api/cashier/check-in',{cookie:cookies.CASHIER,body:{qrToken:token}});const actual=r.data?.data?.result;results.push({test:label,status:r.status,result:actual||r.data?.error?.code,ok:r.status===200&&expected.includes(actual)});}
  const valid=await ticket('valid',today,'VALID');
  const matrix=require('/app/node_modules/qrcode').create(valid,{errorCorrectionLevel:'M'}).modules;const side=(matrix.size+8)*6,pixels=new Uint8ClampedArray(side*side);pixels.fill(255);for(let y=0;y<matrix.size;y++)for(let x=0;x<matrix.size;x++)if(matrix.get(y,x))for(let dy=0;dy<6;dy++)for(let dx=0;dx<6;dx++)pixels[((y+4)*6+dy)*side+(x+4)*6+dx]=0;
  const zx=require('/app/node_modules/@zxing/library');const decoded=new zx.MultiFormatReader().decode(new zx.BinaryBitmap(new zx.HybridBinarizer(new zx.RGBLuminanceSource(pixels,side,side)))).getText();results.push({test:'qr_encode_decode',ok:decoded===valid});
  await scan('qr_valid',valid,['SUCCESS']);await scan('qr_repeat',valid,['ALREADY_USED']);
  await scan('qr_used',await ticket('used',today,'USED'),['ALREADY_USED']);await scan('qr_wrong_date',await ticket('date',wrong,'VALID'),['WRONG_DATE']);await scan('qr_wrong_location',await ticket('location',other,'VALID'),['WRONG_LOCATION']);await scan('qr_cancelled',await ticket('cancelled',today,'CANCELLED'),['CANCELLED']);await scan('qr_refunded',await ticket('refunded',today,'REFUNDED'),['REFUNDED','CANCELLED']);await scan('qr_unknown','qa-invalid-'+suffix,['INVALID']);
  const race=await ticket('race',today,'VALID');const concurrent=await Promise.all([request('/api/cashier/check-in',{cookie:cookies.CASHIER,body:{qrToken:race}}),request('/api/cashier/check-in',{cookie:cookies.CASHIER,body:{qrToken:race}})]);const codes=concurrent.map(x=>x.data?.data?.result).sort();results.push({test:'qr_concurrent_single_entry',results:codes,ok:JSON.stringify(codes)===JSON.stringify(['ALREADY_USED','SUCCESS'])});
  return{ok:true,allPassed:results.every(x=>x.ok),results,providerPaymentRefundTested:false,physicalCameraTested:false};
 }finally{
  // Only this run's synthetic IDs are changed. Preserve audit evidence, invalidate access.
  if(userIds.length){await db.user.updateMany({where:{id:{in:userIds}},data:{status:'DISABLED'}});await db.staffSession.deleteMany({where:{userId:{in:userIds}}});}
  if(ticketIds.length)await db.ticket.updateMany({where:{id:{in:ticketIds}},data:{status:'CANCELLED'}});
  if(orderIds.length)await db.order.updateMany({where:{id:{in:orderIds}},data:{status:'CANCELLED'}});
  if(shiftIds.length)await db.cashierShift.updateMany({where:{id:{in:shiftIds}},data:{status:'CLOSED',closedAt:new Date(),closingCashAmount:0,expectedCashAmount:0,cashDifferenceAmount:0}});
  assert.equal(await db.user.count({where:{id:{in:userIds},status:'ACTIVE'}}),0);assert.equal(await db.cashierShift.count({where:{id:{in:shiftIds},status:'OPEN'}}),0);
 }
}
http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');try{if(req.url==='/inventory'&&req.method==='GET')res.end(JSON.stringify(await inventory()));else if(req.url==='/test'&&req.method==='POST')res.end(JSON.stringify(await test()));else{res.writeHead(404);res.end('{}');}}catch(e){res.writeHead(500);res.end(JSON.stringify({ok:false,error:e.code||e.name,message:String(e.message).slice(0,100)}));}}).listen(Number(process.env.PORT||8080),'0.0.0.0');
