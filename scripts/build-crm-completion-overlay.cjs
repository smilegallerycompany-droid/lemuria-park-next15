#!/usr/bin/env node
"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const BASE='sha256:3cd822308d4a3291ed40e34882401076cf93a1c9fa225a1ddb9dfc94d6ee81f7';
const ident='[A-Za-z_$][\\w$]*';
function patchTicketApi(body){
 const old='session:{select:{startsAt:!0,location:{select:{id:!0,name:!0}}}}';
 assert.equal(body.split(old).length-1,1,'Unique ticket location projection');
 return body.replace(old,'session:{select:{startsAt:!0,location:{select:{id:!0,name:!0,timezone:!0}}}}');
}
function patchTickets(body){
 assert.ok(body.includes('Выданные билеты'));
 const re=new RegExp('(\\(0,'+ident+'\\.r6\\))\\(('+ident+')\\.session\\.startsAt\\)','g');
 const m=[...body.matchAll(re)];assert.equal(m.length,1,'Unique ticket session display');
 return body.replace(re,'$1($2.session.startsAt,$2.session.location?.timezone??"Europe/Moscow")');
}
function financeHero(body){
 const re=new RegExp('\\(0,('+ident+')\\.jsxs\\)\\("div",\\{className:('+ident+')\\(\\)\\.hero,children:\\[\\(0,\\1\\.jsx\\)\\("span",\\{children:"Итого выручка"\\}\\),\\(0,\\1\\.jsx\\)\\("strong",\\{children:(\\(0,'+ident+'\\.O5\\))\\((\\(0,'+ident+'\\.N5\\)\\(('+ident+')\\)\\.revenue)\\)\\}\\),\\(0,\\1\\.jsx\\)\\("small",\\{children:"Возвращённые покупателям деньги не включены"\\}\\)\\]\\}\\)','g');
 const matches=[...body.matchAll(re)];assert.equal(matches.length,1,'Unique overall finance hero');
 return matches[0];
}
function patchFinance(body){
 assert.ok(body.includes('Кассовая выручка и расходы'));
 const m=financeHero(body),[,jsx,css,money,net,data]=m;
 const card=(label,expression,note,hero=false)=>`(0,${jsx}.jsxs)("div",{${hero?`className:${css}().hero,`:''}children:[(0,${jsx}.jsx)("span",{children:${JSON.stringify(label)}}),(0,${jsx}.jsx)("strong",{children:${money}(${expression})}),(0,${jsx}.jsx)("small",{children:${JSON.stringify(note)}})]})`;
 const cards=[card('Выручка по билетам',`${data}.revenue.tickets`,'До возвратов · касса · без допродаж и онлайн',true),card('Допродажи отдельно',`${data}.revenue.feed+${data}.revenue.balabas+${data}.revenue.photo`,'Корм, Балабас и фото · до возвратов'),card('Общий кассовый итог',net,'Билеты и допродажи · после возвратов')];
 body=body.replace(m[0],cards.join(','));
 assert.equal(body.split('children:"Итого выручка"').length-1,1);
 return body.replace('children:"Итого выручка"','children:"Общий кассовый итог"').replace('01 / Выручка','01 / Билетная выручка и допродажи');
}
function patchFinancePdf(body){
 const report=body.match(/rows:\[\["Билеты",(\w+)\((\w+)\.revenue\.tickets\)\]/);assert.ok(report,'PDF report object');
 const re=/\{text:`Итого выручка: \$\{(\w+)\((\w+)\.revenue\)\}`,emphasis:!0\}/g;
 const m=[...body.matchAll(re)];assert.equal(m.length,1,'Unique PDF total');
 const [,money,net]=m[0],d=report[2];assert.equal(money,report[1]);
 return body.replace(re,'{text:`Выручка по билетам (до возвратов): ${'+money+'('+d+'.revenue.tickets)}`,emphasis:!0},{text:`Допродажи отдельно (до возвратов): ${'+money+'('+d+'.revenue.feed+'+d+'.revenue.balabas+'+d+'.revenue.photo)}`},{text:`Общий кассовый итог (после возвратов): ${'+money+'('+net+'.revenue)}`,emphasis:!0}')
  .replaceAll('Итого выручка','Общий кассовый итог').replace('01 / Выручка','01 / Билетная выручка и допродажи');
}
function build(root,commit){
 assert.match(commit,/^[a-f0-9]{40}$/);
 const prior=JSON.parse(fs.readFileSync(path.join(root,'public/crm-release.json'),'utf8'));
 assert.equal(prior.releaseId,'crm-localtime-20261106-26ae1073');
 const files=new Map(),originals=new Map();
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(js|json|css|html|rsc|meta|txt)$/.test(e.name)){const rel=path.relative(root,f),s=fs.readFileSync(f,'utf8');files.set(rel,s);originals.set(rel,s);}}}
 walk(path.join(root,'.next'));
 const counts={ticketApi:0,ticketClient:0,ticketServer:0,financeClient:0,financeServer:0,financePdf:0};
 for(const[f,original]of files){let s=original;
  if(f==='.next/server/app/api/director/tickets/route.js'){s=patchTicketApi(s);counts.ticketApi++;}
  if(s.includes('Выданные билеты')){s=patchTickets(s);counts[f.startsWith('.next/static/')?'ticketClient':'ticketServer']++;}
  if(s.includes('Кассовая выручка и расходы')&&s.includes('Возвращённые покупателям деньги не включены')){s=patchFinance(s);counts[f.startsWith('.next/static/')?'financeClient':'financeServer']++;}
  if(f==='.next/server/app/api/director/finance/pdf/route.js'){s=patchFinancePdf(s);counts.financePdf++;}
  files.set(f,s);
 }
 assert.deepEqual(counts,{ticketApi:1,ticketClient:1,ticketServer:2,financeClient:1,financeServer:1,financePdf:1});
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),renamed=[];
 for(let pass=0;pass<12;pass++){
  const changes=[];for(const[f,s]of files){if(!f.startsWith('.next/static/')||originals.get(f)===s)continue;const m=f.match(/(?:-|\/)([a-f0-9]{16,32})\.(?:js|css)$/);if(!m)continue;const next=hash(s).slice(0,m[1].length);if(next!==m[1])changes.push({file:f,old:m[1],next,to:f.replace(m[1],next)});}
  if(!changes.length)break;assert.ok(pass<11,'Asset reference convergence');
  for(const c of changes){const s=files.get(c.file);files.delete(c.file);files.set(c.to,s);renamed.push(c);}
  for(const[f,s]of files){let b=s;for(const c of changes)b=b.replaceAll(c.old,c.next);files.set(f,b);}
 }
 const output=[];for(const[f,s]of files){if(originals.get(f)===s)continue;const dest=path.join(root,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,s);if(f.endsWith('.json'))JSON.parse(s);if(f.endsWith('.js'))cp.execFileSync(process.execPath,['--check',dest],{stdio:'pipe'});output.push({path:f,sha256:hash(s),bytes:Buffer.byteLength(s)});}
 const manifest={releaseId:'crm-tickets-revenue-20261107-'+commit.slice(0,8),sourceCommit:commit,baseImageDigest:BASE,builtAt:new Date().toISOString(),counts,renamedAssets:renamed,files:output,databaseMigrations:false,scope:'Ticket timezone projection; separate ticket revenue, add-ons and full cash total in UI/PDF; unchanged financial calculations'};
 fs.writeFileSync(path.join(root,'public/crm-release.json'),JSON.stringify(manifest,null,2)+'\n');output.push({path:'public/crm-release.json'});fs.writeFileSync(path.join(root,'crm-completion-overlay-files.json'),JSON.stringify(output,null,2)+'\n');
 return {releaseId:manifest.releaseId,counts,files:output.length,syntaxChecks:'passed'};
}
module.exports={BASE,patchTicketApi,patchTickets,patchFinance,patchFinancePdf,financeHero,build};
if(require.main===module)console.log(JSON.stringify(build(path.resolve(process.argv[2]),process.argv[3])));
