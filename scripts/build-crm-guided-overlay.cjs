#!/usr/bin/env node
"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const BASE='sha256:1092b51aaa8e6496044034f2d3250b53f55ba5023ae393c7420ff87be1933475';


function once(body,old,next){assert.equal(body.split(old).length-1,1,'Unique fragment: '+old.slice(0,60));return body.replace(old,next);}
function patchCashier(body){
 assert.ok(body.includes('cashier-sale-panel'),'Current mobile release required');
 const sessionLabel=/children:([\w$]+)\?"Продать билет":"Продажа недоступна"/g;assert.equal([...body.matchAll(sessionLabel)].length,1);body=body.replace(sessionLabel,'children:$1?"Выбрать этот сеанс":"Продажа недоступна"');
 body=once(body,'children:"Панель продажи"','children:"1. Выберите билеты"');
 const section=/\(0,([\w$]+)\.jsxs\)\("section",\{className:"mt-4 rounded-2xl border border-beige p-3","aria-label":"Дополнительно в чек",/g;
 const matches=[...body.matchAll(section)];assert.equal(matches.length,1,'Unique extras section');
 const jsx=matches[0][1];
 const scroll=id=>`()=>{document.getElementById("${id}")?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"})}`;
 const next=(id,label)=>`(0,${jsx}.jsx)("button",{type:"button",className:"cashier-step-next",onClick:${scroll(id)},children:"${label}"})`;
 body=body.replace(section,next('cashier-extras-step','Далее: корм и фото')+`,(0,${jsx}.jsxs)("section",{id:"cashier-extras-step",className:"mt-4 rounded-2xl border border-beige p-3","aria-label":"2. Корм и фото",`);
 body=once(body,'children:"Дополнительно в чек"','children:"2. Корм и фото"');
 body=once(body,'children:"Количество товаров не влияет на места в сеансе."','children:"Добавьте корм и фото в этот заказ. Товары не занимают места в сеансе."');
 const total=`(0,${jsx}.jsxs)("div",{className:"mt-4 rounded-2xl bg-cream p-4",children:[`;
 body=once(body,total,next('cashier-payment-step','Далее: оплата')+`,(0,${jsx}.jsxs)("div",{id:"cashier-payment-step",className:"mt-4 rounded-2xl bg-cream p-4",children:[(0,${jsx}.jsx)("h4",{className:"font-bold",children:"3. Оплата и сохранение"}),`);
 const payment=`className:"mt-4 grid gap-3",children:[`;
 body=once(body,payment,payment+`(0,${jsx}.jsx)("p",{className:"cashier-save-hint",children:"Заказ появится в продажах после подтверждения оплаты. Дождитесь сообщения с номером заказа."}),`);
 body=once(body,'?"Наличные получены":"Терминал одобрил"','?"Наличные получены — сохранить":"Оплата одобрена — сохранить"');
 return body;
}
function patchCss(body){
 assert.ok(body.includes('Mobile cashier checkout navigation'));
 return body+'\n/* Guided cashier sale: tickets, extras, confirmed payment. */\n#cashier-extras-step,#cashier-payment-step{scroll-margin-top:96px}.cashier-step-next{display:flex;align-items:center;justify-content:center;min-height:48px;width:100%;margin-top:16px;padding:12px 16px;border:1px solid #2f6b45;border-radius:14px;background:#e8f3e9;color:#16422b;font:inherit;font-weight:800;white-space:normal;touch-action:manipulation}.cashier-step-next:focus-visible{outline:2px solid #2f6b45;outline-offset:3px}.cashier-save-hint{padding:12px;border:1px solid #d1dfcf;border-radius:12px;background:#f4f8f3;color:#244c37;font-size:14px;line-height:1.45}.cashier-shell .internal-dialog-backdrop{padding:16px;overflow:hidden}.cashier-shell .internal-dialog{display:flex;flex-direction:column;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow:hidden;box-sizing:border-box}.cashier-shell .internal-dialog h2{flex-shrink:0;line-height:1.25}.cashier-shell .internal-dialog p{min-height:0;overflow:auto;overscroll-behavior:contain}.cashier-shell .internal-dialog-actions{flex-shrink:0;flex-wrap:wrap}.cashier-shell .internal-dialog-actions button{min-height:44px;max-width:100%;white-space:normal;line-height:1.25}@media(max-width:600px){.cashier-shell .internal-dialog{padding:14px}.cashier-shell .internal-dialog-actions{flex-direction:column}.cashier-shell .internal-dialog-actions button{width:100%}}\n';
}
function build(root,commit){
 assert.match(commit,/^[a-f0-9]{40}$/);
 const prior=JSON.parse(fs.readFileSync(path.join(root,'public/crm-release.json'),'utf8'));
 assert.equal(prior.releaseId,'crm-mobile-sale-20261107-910694f9');
 const files=new Map(),originals=new Map();
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(js|json|css|html|rsc|meta|txt)$/.test(e.name)){const rel=path.relative(root,f),s=fs.readFileSync(f,'utf8');files.set(rel,s);originals.set(rel,s);}}}
 walk(path.join(root,'.next'));
 const counts={cashierClient:0,cashierServer:0,cashierCss:0};
 for(const[f,original]of files){let s=original;
  if(s.includes('cashier-sale-panel')&&s.includes('Панель продажи')&&s.includes('Дополнительно в чек')){s=patchCashier(s);counts[f.startsWith('.next/static/')?'cashierClient':'cashierServer']++;}
  if(f.endsWith('.css')&&s.includes('Mobile cashier checkout navigation')){s=patchCss(s);counts.cashierCss++;}
  files.set(f,s);
 }
 assert.equal(counts.cashierClient,1);assert.ok(counts.cashierServer>=1&&counts.cashierServer<=2);assert.equal(counts.cashierCss,2);
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),renamed=[];
 for(let pass=0;pass<12;pass++){
  const changes=[];for(const[f,s]of files){if(!f.startsWith('.next/static/')||originals.get(f)===s)continue;const m=f.match(/(?:-|\/)([a-f0-9]{16,32})\.(?:js|css)$/);if(!m)continue;const next=hash(s).slice(0,m[1].length);if(next!==m[1])changes.push({file:f,old:m[1],next,to:f.replace(m[1],next)});}
  if(!changes.length)break;assert.ok(pass<11,'Asset reference convergence');
  for(const c of changes){const s=files.get(c.file);files.delete(c.file);files.set(c.to,s);renamed.push(c);}
  for(const[f,s]of files){let b=s;for(const c of changes)b=b.replaceAll(c.old,c.next);files.set(f,b);}
 }
 const output=[];for(const[f,s]of files){if(originals.get(f)===s)continue;const dest=path.join(root,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,s);if(f.endsWith('.json'))JSON.parse(s);if(f.endsWith('.js'))cp.execFileSync(process.execPath,['--check',dest],{stdio:'pipe'});output.push({path:f,sha256:hash(s),bytes:Buffer.byteLength(s)});}
 const manifest={releaseId:'crm-guided-sale-20261107-'+commit.slice(0,8),sourceCommit:commit,baseImageDigest:BASE,builtAt:new Date().toISOString(),counts,renamedAssets:renamed,files:output,databaseMigrations:false,scope:'Guided ticket, feed/photo and payment steps; visible confirmation controls on short screens; unchanged sale and accounting logic'};
 fs.writeFileSync(path.join(root,'public/crm-release.json'),JSON.stringify(manifest,null,2)+'\n');output.push({path:'public/crm-release.json'});fs.writeFileSync(path.join(root,'crm-guided-overlay-files.json'),JSON.stringify(output,null,2)+'\n');
 return {releaseId:manifest.releaseId,counts,files:output.length,syntaxChecks:'passed'};
}
module.exports={BASE,patchCashier,patchCss,build};
if(require.main===module)console.log(JSON.stringify(build(path.resolve(process.argv[2]),process.argv[3])));
