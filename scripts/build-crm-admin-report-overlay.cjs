#!/usr/bin/env node
"use strict";
// Scoped ADMIN read access to finance; preserve director/owner-only balance writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||''),commit=process.argv[3];
assert.match(commit||'',/^[a-f0-9]{40}$/);
const prior=JSON.parse(fs.readFileSync(path.join(root,'public/crm-release.json'),'utf8'));
assert.equal(prior.releaseId,'crm-cashier-reports-20261104-90150ff6');
const baseDigest='sha256:85059a1fbc2d7925bbb45a33de363d7b9b82300c04cef07dc731f7b00369a123';
const releaseId='crm-admin-reports-20261104-'+commit.slice(0,8);
const files=new Map(),originals=new Map();
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);
 else if(/\.(js|json|css|html|rsc|meta|txt)$/.test(entry.name)){const rel=path.relative(root,file),body=fs.readFileSync(file,'utf8');files.set(rel,body);originals.set(rel,body);}
}}
walk(path.join(root,'.next'));
const counts={financeService:0,financeGet:0,financePdfGet:0,financePage:0,navClient:0,navServer:0,pdfLayout:0};
function replaceOne(body,old,next,label){assert.equal(body.split(old).length-1,1,label);return body.replace(old,next);}
function patchGet(body){
 const exported=body.match(/GET:\(\)=>([A-Za-z0-9_$]+)/);assert.ok(exported);
 const start=body.indexOf('async function '+exported[1]+'(',exported.index);assert.ok(start>=0);
 let end=body.indexOf('async function ',start+15);if(end<0)end=body.length;
 const get=replaceOne(body.slice(start,end),'Td)(["DIRECTOR","OWNER"])','Td)(["ADMIN","DIRECTOR","OWNER"])','GET role guard');
 return body.slice(0,start)+get+body.slice(end);
}
for(const [file,original]of files){let body=original;
 if(file.startsWith('.next/server/')&&body.includes('60664:')&&body.includes('Финансы доступны директору и собственнику')){
  const start=body.indexOf('60664:'),tail='RepeatableRead})}',end=body.indexOf(tail,start)+tail.length;
  assert.ok(end>start&&end-start<20000);
  let module=body.slice(start,end);
  const matches=[...module.matchAll(/!\["DIRECTOR","OWNER"\]\.includes\((\w+)\.role\)/g)];assert.equal(matches.length,1);
  module=module.replace(/!\["DIRECTOR","OWNER"\]\.includes\((\w+)\.role\)/,'!["ADMIN","DIRECTOR","OWNER"].includes($1.role)')
   .replace('Финансы доступны директору и собственнику','Отчёты доступны администратору, директору и собственнику');
  assert.ok(module.includes('order:{source:"CASHIER"}'));
  body=body.slice(0,start)+module+body.slice(end);counts.financeService++;
 }
 if(file==='.next/server/app/api/director/finance/route.js'){
  body=patchGet(body);counts.financeGet++;
  // The POST confirmation must retain the old director/owner-only guard.
  assert.equal((body.match(/Td\)\(\["DIRECTOR","OWNER"\]\)/g)||[]).length,1);
  assert.ok(body.includes('Подтверждать остатки может директор или собственник'));
 }
 if(file==='.next/server/app/api/director/finance/pdf/route.js'){
  body=patchGet(body);counts.financePdfGet++;
  body=replaceOne(body,'title:"Итого в сейфе"','title:"Итого в сейфе (факт, не прибыль)"','PDF balance heading');
  body=replaceOne(body,',{emphasis:!0,text:"Сейф - фактически подтверждённая сумма, а не расчёт прибыли."}','','PDF orphan paragraph');counts.pdfLayout++;
 }
 if(file==='.next/server/app/director/finance/page.js'){
  const guard=/"DIRECTOR"!==(\w+)\.role&&"OWNER"!==\1\.role/g;assert.equal([...body.matchAll(guard)].length,1);
  body=body.replace(guard,'"DIRECTOR"!==$1.role&&"OWNER"!==$1.role&&"ADMIN"!==$1.role');counts.financePage++;
 }
 if(body.includes('Навигация директора')){
  const filter=/\.filter\((\w+)=>"\/director\/finance"!==\1\.href\|\|"DIRECTOR"===(\w+)\.role\|\|"OWNER"===\2\.role\)/g;
  const matches=[...body.matchAll(filter)];
  if(matches.length){
   assert.equal(matches.length,1);const me=matches[0][2];
   body=body.replace(filter,(_all,row,user)=>`.filter(${row}=>"/director/finance"!==${row}.href||["ADMIN","DIRECTOR","OWNER"].includes(${user}.role))`);
   body=replaceOne(body,'children:"Директор"',`children:"ADMIN"===${me}?.role?"Администратор":"Директор"`,'Portal title');
   counts[file.startsWith('.next/static/')?'navClient':'navServer']++;
  }
 }
 files.set(file,body);
}
for(const key of ['financeService','financeGet','financePdfGet','financePage','pdfLayout'])assert.equal(counts[key],1,key);
assert.ok(counts.navClient>=1&&counts.navServer>=1);
const renamed=[];
for(let pass=0;pass<12;pass++){
 const changes=[];for(const [file,body]of files){
  if(!file.startsWith('.next/static/')||originals.get(file)===body)continue;
  const m=file.match(/(?:-|\/)([a-f0-9]{16,32})\.(?:js|css)$/);if(!m)continue;
  const next=hash(body).slice(0,m[1].length);if(next!==m[1])changes.push({file,oldHash:m[1],newHash:next,to:file.replace(m[1],next)});
 }
 if(!changes.length)break;assert.ok(pass<11,'Asset convergence');
 for(const change of changes){const body=files.get(change.file);files.delete(change.file);files.set(change.to,body);renamed.push(change);}
 for(const[file,original]of files){let body=original;for(const change of changes)body=body.replaceAll(change.oldHash,change.newHash);files.set(file,body);}
}
const output=[];for(const[file,body]of files){if(originals.get(file)===body)continue;
 const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);
 if(file.endsWith('.json'))JSON.parse(body);
 if(file.endsWith('.js'))cp.execFileSync(process.execPath,['--check',target],{stdio:'pipe'});
 output.push({path:file,sha256:hash(body),bytes:Buffer.byteLength(body)});
}
const manifest={releaseId,sourceCommit:commit,baseImageDigest:baseDigest,builtAt:new Date().toISOString(),counts,renamedAssets:renamed,files:output,databaseMigrations:false,scope:'ADMIN finance/PDF read in assigned locations; director/owner balance confirmation unchanged; no ONLINE revenue'};
fs.writeFileSync(path.join(root,'public/crm-release.json'),JSON.stringify(manifest,null,2)+'\n');
output.push({path:'public/crm-release.json'});fs.writeFileSync(path.join(root,'crm-overlay-files.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({releaseId,counts,files:output.length,syntaxChecks:'passed',balancePostExpanded:false}));
