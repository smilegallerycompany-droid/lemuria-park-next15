"use strict";
// Temporary private IAM-protected audit, using the exact production image.
// Never start the app, seed, migrate, read password hashes or modify records.
const http = require('node:http');
const fs = require('node:fs');
const {PrismaClient, Prisma} = require('/app/node_modules/@prisma/client');
const env=process.env;
const url=env.DATABASE_URL || `postgresql://${encodeURIComponent(env.DB_USER)}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${env.DB_PORT||6432}/${env.DB_NAME}?sslmode=require&connection_limit=1&connect_timeout=10`;
const db=new PrismaClient({datasources:{db:{url}},log:[]});
function routes(root='/app/.next/server/app', prefix='') {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?routes(root+'/'+e.name,prefix+'/'+e.name):/^(page|route)\.js$/.test(e.name)?[prefix+'/'+e.name]:[]);
}
async function audit() {
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20000ms'");
  const [identity]=await tx.$queryRawUnsafe('SELECT current_database() AS database');
  if(identity.database!=='lemuria') throw new Error('WRONG_DATABASE');
  const userModel=Prisma.dmmf.datamodel.models.find(m=>m.name==='User');
  const allowed=['id','email','name','fullName','role','status','isActive','disabledAt','locationId','createdAt','updatedAt','mustChangePassword','passwordChangedAt'];
  const select=Object.fromEntries(userModel.fields.filter(f=>allowed.includes(f.name)).map(f=>[f.name,true]));
  const users=await tx.user.findMany({select,orderBy:{createdAt:'asc'},take:150});
  const locations=await tx.location.findMany({select:{id:true,name:true,slug:true,status:true,timezone:true}});
  const models=Prisma.dmmf.datamodel.models.map(m=>({name:m.name,fields:m.fields.map(f=>({name:f.name,type:f.type,kind:f.kind}))}));
  return {ok:true,identity,users,locations,models,enums:Prisma.dmmf.datamodel.enums,routes:routes()};
 },{timeout:25000});
}
http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'||req.url!=='/audit'){res.writeHead(404);res.end('{"ok":false}');return;}
 try{res.end(JSON.stringify(await audit(),(_,v)=>typeof v==='bigint'?v.toString():v));}
 catch(e){res.writeHead(500);res.end(JSON.stringify({ok:false,error:'AUDIT_FAILED',code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'READ_FAILED'}));}
}).listen(Number(env.PORT||8080),'0.0.0.0');
