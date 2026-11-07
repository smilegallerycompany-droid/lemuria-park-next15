#!/usr/bin/env node
"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const BASE='sha256:1a99b528b4ab755889c057b06c65ca68316545aa7bcbdd990740ba39acce0587';

function patchCashier(body){
 assert.ok(body.includes('Продать билет')&&body.includes('Панель продажи'));
 const re=/onClick:\(\)=>\{([\w$]+)\(([\w$]+)\.publicId\),([\w$]+)\(\{\}\),([\w$]+)\(null\)\}/g;
 assert.equal([...body.matchAll(re)].length,1,'Unique session sale handler');
 body=body.replace(re,(_,select,session,quantities,error)=>`onClick:()=>{${select}(${session}.publicId),${quantities}({}),${error}(null);if(window.innerWidth<1024)window.requestAnimationFrame(()=>{const panel=document.getElementById("cashier-sale-panel");if(panel){panel.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});panel.focus({preventScroll:true})}})}`);
 const aside='"aside",{className:"cashier-home-aside",';
 assert.equal(body.split(aside).length-1,1,'Unique sale panel');
 body=body.replace(aside,'"aside",{id:"cashier-sale-panel",tabIndex:-1,"aria-label":"Оформление билетов",className:"cashier-home-aside",');
 const heading=/\(0,([\w$]+)\.jsx\)\("p",\{className:"[^"]+",children:"Панель продажи"\}\)/g;
 assert.equal([...body.matchAll(heading)].length,1,'Unique sale heading');
 return body.replace(heading,(original,jsx)=>`(0,${jsx}.jsx)("button",{type:"button",className:"cashier-return-sessions",onClick:()=>{document.querySelector(".cashier-home-sessions")?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"})},children:"← Выбрать другой сеанс"}),${original}`);
}
function patchCss(body){
 assert.ok(body.includes('.cashier-home-aside{min-width:0}'));
 return body+'\n/* Mobile cashier checkout navigation; financial behavior unchanged. */\n.cashier-home-aside,.cashier-home-sessions{scroll-margin-top:96px}.cashier-home-aside:focus-visible{outline:2px solid #4a7c59;outline-offset:4px}.cashier-return-sessions{display:none}@media(max-width:1023px){.cashier-return-sessions{display:flex;align-items:center;justify-content:center;width:100%;min-height:44px;margin:0 0 16px;padding:10px 12px;border:1px solid #4a7c59;border-radius:14px;background:#fff;color:#244c37;font:inherit;font-weight:700;touch-action:manipulation}.cashier-home-aside{max-width:100%;padding-bottom:16px}.cashier-home-aside input,.cashier-home-aside select{font-size:16px}.cashier-home-aside button[aria-label]{min-width:44px;min-height:44px;touch-action:manipulation}}\n';
}
function build(root,commit){
 assert.match(commit,/^[a-f0-9]{40}$/);
 const prior=JSON.parse(fs.readFileSync(path.join(root,'public/crm-release.json'),'utf8'));
 assert.equal(prior.releaseId,'crm-tickets-revenue-20261107-4ca654fa');
 const files=new Map(),originals=new Map();
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(js|json|css|html|rsc|meta|txt)$/.test(e.name)){const rel=path.relative(root,f),s=fs.readFileSync(f,'utf8');files.set(rel,s);originals.set(rel,s);}}}
 walk(path.join(root,'.next'));
 const counts={cashierClient:0,cashierServer:0,cashierCss:0};
 for(const[f,original]of files){let s=original;
  if(s.includes('Продать билет')&&s.includes('Панель продажи')&&s.includes('cashier-home-aside')){s=patchCashier(s);counts[f.startsWith('.next/static/')?'cashierClient':'cashierServer']++;}
  if(f.endsWith('.css')&&s.includes('.cashier-home-aside{min-width:0}')){s=patchCss(s);counts.cashierCss++;}
  files.set(f,s);
 }
 assert.equal(counts.cashierClient,1);assert.ok(counts.cashierServer>=1&&counts.cashierServer<=2);assert.equal(counts.cashierCss,1);
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),renamed=[];
 for(let pass=0;pass<12;pass++){
  const changes=[];for(const[f,s]of files){if(!f.startsWith('.next/static/')||originals.get(f)===s)continue;const m=f.match(/(?:-|\/)([a-f0-9]{16,32})\.(?:js|css)$/);if(!m)continue;const next=hash(s).slice(0,m[1].length);if(next!==m[1])changes.push({file:f,old:m[1],next,to:f.replace(m[1],next)});}
  if(!changes.length)break;assert.ok(pass<11,'Asset reference convergence');
  for(const c of changes){const s=files.get(c.file);files.delete(c.file);files.set(c.to,s);renamed.push(c);}
  for(const[f,s]of files){let b=s;for(const c of changes)b=b.replaceAll(c.old,c.next);files.set(f,b);}
 }
 const output=[];for(const[f,s]of files){if(originals.get(f)===s)continue;const dest=path.join(root,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,s);if(f.endsWith('.json'))JSON.parse(s);if(f.endsWith('.js'))cp.execFileSync(process.execPath,['--check',dest],{stdio:'pipe'});output.push({path:f,sha256:hash(s),bytes:Buffer.byteLength(s)});}
 const manifest={releaseId:'crm-mobile-sale-20261107-'+commit.slice(0,8),sourceCommit:commit,baseImageDigest:BASE,builtAt:new Date().toISOString(),counts,renamedAssets:renamed,files:output,databaseMigrations:false,scope:'Mobile session selection scrolls to checkout; accessible panel; return navigation and touch targets; payment and sale calculations unchanged'};
 fs.writeFileSync(path.join(root,'public/crm-release.json'),JSON.stringify(manifest,null,2)+'\n');output.push({path:'public/crm-release.json'});fs.writeFileSync(path.join(root,'crm-mobile-overlay-files.json'),JSON.stringify(output,null,2)+'\n');
 return {releaseId:manifest.releaseId,counts,files:output.length,syntaxChecks:'passed'};
}
module.exports={BASE,patchCashier,patchCss,build};
if(require.main===module)console.log(JSON.stringify(build(path.resolve(process.argv[2]),process.argv[3])));
