#!/usr/bin/env node
"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const BASE='sha256:012c2ea57d26ac12a8e781f971447fe391a76b6289b3c9b0c261d7a581fec91c';



const NOTICE='Перерыв с 13:00 до 13:30 и с 17:00 до 17:30';
const FIND='findByPublicId:(a,b)=>a.session.findUnique({where:{publicId:b},include:{location:!0}})';
const LIST='listCandidates:(a,b)=>a.session.findMany({where:{locationId:b.locationId,park:b.park??"LEMURIA",status:{in:b.statuses},startsAt:{gte:b.from,lt:b.toExclusive}},orderBy:{startsAt:"asc"},take:b.take})';
function patchRepository(body){
 assert.ok(!body.includes('session-break-policy.cjs'),'Unpatched repository required');
 assert.equal(body.split(FIND).length-1,1);assert.equal(body.split(LIST).length-1,1);
 return body.replace(FIND,FIND+'.then(session=>require("/app/session-break-policy.cjs").isBreak(session)?null:session)')
 .replace(LIST,LIST+'.then(rows=>require("/app/session-break-policy.cjs").filterCandidates(a,b,rows))');
}
const style='{margin:"0 0 12px",padding:"12px 14px",border:"1px solid #eccb81",borderRadius:12,background:"#fff4da",color:"#513d14",fontWeight:700,whiteSpace:"normal"}';
function notice(jsx,condition){return `${condition}?(0,${jsx}.jsx)("p",{className:"booking-hint",role:"note",style:${style},children:${JSON.stringify(NOTICE)}}):null,`;}
function patchBooking(body){
 const re=/\(0,([\w$]+)\.jsxs\)\("div",\{className:"booking-column booking-pick",children:\[/g;
 const m=[...body.matchAll(re)];assert.equal(m.length,1,'Unique date/time block');
 const config=body.match(/Дата и время"\]\}\),([\w$]+)&&\1\.locations\.length/);assert.ok(config,'Booking location state');
 return body.replace(re,m[0][0]+notice(m[0][1],`${config[1]}?.location?.slug==="saratov"`));
}
function patchCashier(body){
 const re=/className:"cashier-home-main",children:\[\(0,([\w$]+)\.jsxs\)/g;
 const m=[...body.matchAll(re)];assert.equal(m.length,1,'Unique cashier workspace');
 const shift=body.match(/let\{shift:([\w$]+),loading:/);assert.ok(shift,'Cashier shift state');
 return body.replace(re,`className:"cashier-home-main",children:[${notice(m[0][1],`${shift[1]}?.location?.city==="Саратов"`)}(0,${m[0][1]}.jsxs)`);
}
function build(root,commit){
 assert.match(commit,/^[a-f0-9]{40}$/);
 const prior=JSON.parse(fs.readFileSync(path.join(root,'public/crm-release.json'),'utf8'));
 assert.equal(prior.releaseId,'crm-guided-sale-20261107-b509d13c');
 const files=new Map(),originals=new Map();
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(js|json|css|html|rsc|meta|txt)$/.test(e.name)){const rel=path.relative(root,f),s=fs.readFileSync(f,'utf8');files.set(rel,s);originals.set(rel,s);}}}
 walk(path.join(root,'.next'));
 const counts={repositories:0,bookingClient:0,bookingServer:0,cashierClient:0,cashierServer:0};
 for(const[f,original]of files){let body=original;
  if(f.startsWith('.next/server/')&&body.includes(FIND)&&body.includes(LIST)){body=patchRepository(body);counts.repositories++;}
  if((f.startsWith('.next/server/')||f==='.next/static/chunks/4267-f584662b37984e7f.js')&&body.includes('className:"booking-column booking-pick"')){body=patchBooking(body);counts[f.startsWith('.next/static/')?'bookingClient':'bookingServer']++;}
  if(body.includes('cashier-extras-step')&&body.includes('cashier-home-main')&&body.includes('Выбрать этот сеанс')){body=patchCashier(body);counts[f.startsWith('.next/static/')?'cashierClient':'cashierServer']++;}
  files.set(f,body);
 }
 assert.ok(counts.repositories>=1&&counts.repositories<=20);assert.equal(counts.bookingClient,1);assert.ok(counts.bookingServer>=1&&counts.bookingServer<=5);assert.equal(counts.cashierClient,1);assert.equal(counts.cashierServer,1);
 const policy=fs.readFileSync(path.join(__dirname,'session-break-policy.cjs'),'utf8');files.set('session-break-policy.cjs',policy);
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),renamed=[];
 for(let pass=0;pass<12;pass++){
  const changes=[];for(const[f,s]of files){if(!f.startsWith('.next/static/')||originals.get(f)===s)continue;const m=f.match(/(?:-|\/)([a-f0-9]{16,32})\.(?:js|css)$/);if(!m)continue;const next=hash(s).slice(0,m[1].length);if(next!==m[1])changes.push({file:f,old:m[1],next,to:f.replace(m[1],next)});}
  if(!changes.length)break;assert.ok(pass<11,'Asset reference convergence');
  for(const c of changes){const s=files.get(c.file);files.delete(c.file);files.set(c.to,s);renamed.push(c);}
  for(const[f,s]of files){let b=s;for(const c of changes)b=b.replaceAll(c.old,c.next);files.set(f,b);}
 }
 const output=[];for(const[f,s]of files){if(originals.get(f)===s)continue;const dest=path.join(root,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,s);if(f.endsWith('.json'))JSON.parse(s);if(f.endsWith('.js'))cp.execFileSync(process.execPath,['--check',dest],{stdio:'pipe'});output.push({path:f,sha256:hash(s),bytes:Buffer.byteLength(s)});}
 const manifest={releaseId:'saratov-breaks-20261107-'+commit.slice(0,8),sourceCommit:commit,baseImageDigest:BASE,builtAt:new Date().toISOString(),counts,renamedAssets:renamed,files:output,databaseMigrations:false,scope:'Saratov daily 13:00–13:30 and 17:00–17:30 sales blackout; public/CRM notices; existing orders, tickets and payments unchanged'};
 fs.writeFileSync(path.join(root,'public/crm-release.json'),JSON.stringify(manifest,null,2)+'\n');output.push({path:'public/crm-release.json'});fs.writeFileSync(path.join(root,'session-break-overlay-files.json'),JSON.stringify(output,null,2)+'\n');
 return {releaseId:manifest.releaseId,counts,files:output.length,syntaxChecks:'passed'};
}
module.exports={BASE,FIND,LIST,patchRepository,patchBooking,patchCashier,build};
if(require.main===module)console.log(JSON.stringify(build(path.resolve(process.argv[2]),process.argv[3])));
