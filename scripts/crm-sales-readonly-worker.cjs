'use strict';
// Existing private IAM-only audit container. Never starts the app or writes records.
const http=require('node:http');const {PrismaClient,Prisma}=require('/app/node_modules/@prisma/client');
const env=process.env;const url=env.DATABASE_URL||`postgresql://${encodeURIComponent(env.DB_USER)}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${env.DB_PORT||6432}/${env.DB_NAME}?sslmode=require&connection_limit=1&connect_timeout=10`;
const db=new PrismaClient({datasources:{db:{url}},log:[]});
const models=Prisma.dmmf.datamodel.models;
const select=(model,names)=>Object.fromEntries(models.find(m=>m.name===model).fields.filter(f=>names.includes(f.name)&&f.kind!=='object').map(f=>[f.name,true]));
async function audit(){return db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20000ms'");
 const [identity]=await tx.$queryRawUnsafe('SELECT current_database() AS database');if(identity.database!=='lemuria')throw Error('WRONG_DATABASE');
 const location=await tx.location.findFirst({where:{slug:'saratov'},select:{id:true,slug:true,timezone:true}});if(!location)throw Error('LOCATION_MISSING');
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:location.timezone}).format(new Date());
 // Current operational date uses Saratov local midnight; use PG timezone conversion.
 const [range]=await tx.$queryRawUnsafe('SELECT ($1::date::timestamp AT TIME ZONE $2)::timestamptz AS start, (($1::date + 1)::timestamp AT TIME ZONE $2)::timestamptz AS end',date,location.timezone);
 const where={locationId:location.id,createdAt:{gte:range.start,lt:range.end}};
 const [today,allCashier,latest,shifts,users]=await Promise.all([
  tx.order.groupBy({by:['source','status','cashierId'],where,_count:{_all:true},_sum:{totalAmount:true}}),
  tx.order.groupBy({by:['source','status','cashierId'],where:{locationId:location.id,source:'CASHIER'},_count:{_all:true},_sum:{totalAmount:true}}),
  tx.order.findMany({where:{locationId:location.id},select:select('Order',['id','number','status','source','createdAt','cashierId','shiftId','totalAmount','paymentMethod']),orderBy:{createdAt:'desc'},take:25}),
  tx.cashierShift.findMany({where:{locationId:location.id,status:'OPEN'},select:select('CashierShift',['id','cashierId','userId','status','locationId','openedAt','closedAt','openingCash','cashSales','cardSales','salesCount','ordersCount','totalSales','ticketsSold']),take:20}),
  tx.user.findMany({select:select('User',['id','role','status','disabledAt','lastLoginAt']),take:100})]);
 const audits=await tx.auditLog.findMany({where:{action:{startsWith:'CASHIER_SALE'}},select:select('AuditLog',['action','actorId','entityType','entityId','createdAt']),orderBy:{createdAt:'desc'},take:20});
 return {ok:true,date,timezone:location.timezone,today,allCashier,latest,shifts,users,audits,models:models.filter(m=>/Order|CashierShift|CashOperation|Extra|ParkOperation/.test(m.name)).map(m=>({name:m.name,fields:m.fields.map(f=>({name:f.name,type:f.type,kind:f.kind}))}))};
 },{timeout:25000});}
http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');if(req.method!=='GET'||req.url!=='/audit'){res.writeHead(404);res.end('{}');return;}try{res.end(JSON.stringify(await audit(),(_,v)=>typeof v==='bigint'?String(v):v))}catch(e){res.writeHead(500);res.end(JSON.stringify({ok:false,error:'READ_ONLY_AUDIT_FAILED',code:e.code||null}))}}).listen(Number(env.PORT||8080),'0.0.0.0');
