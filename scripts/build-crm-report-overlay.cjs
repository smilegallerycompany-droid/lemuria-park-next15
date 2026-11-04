#!/usr/bin/env node
"use strict";
// Patch the pinned live build; preserve production-only accounting features.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || '');
const commit = process.argv[3];
assert.match(commit || '', /^[a-f0-9]{40}$/);
assert.ok(fs.existsSync(path.join(root, '.next/BUILD_ID')));
const baseDigest = 'sha256:da1b62ffa61ffd6a7b63cdc96776efc1556ba31e9a433294bf16870b02e079fe';
const releaseId = 'crm-cashier-reports-20261104-' + commit.slice(0, 8);
const files = new Map(), originals = new Map();
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function walk(dir) {
  for (const ent of fs.readdirSync(dir, {withFileTypes:true})) {
    const file = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(file);
    else if (/\.(js|json|css|html|rsc|meta|txt)$/.test(ent.name)) {
      const rel = path.relative(root, file), body = fs.readFileSync(file, 'utf8');
      files.set(rel, body); originals.set(rel, body);
    }
  }
}
walk(path.join(root, '.next'));
const counts = {financeModules:0,paymentFilters:0,refundFilters:0,cashierClient:0,cashierServer:0,adminClient:0,adminServer:0,financeClient:0,financeServer:0,mobileCss:0};
const queryEvidence = [];
for (const [file, original] of files) {
  let body = original;
  if (file.startsWith('.next/server/') && body.includes('60664:') && body.includes('Финансы доступны директору и собственнику')) {
    const start = body.indexOf('60664:');
    const tail = 'RepeatableRead})}';
    const end = body.indexOf(tail, start) + tail.length;
    assert.ok(end > start && end - start < 20000, 'Unexpected finance module boundary: ' + file);
    let module = body.slice(start, end);
    for (const [kind, helper] of [['payment','vM'], ['refund','tP']]) {
      const pattern = new RegExp('where:(\\w+)\\.length\\?\\{OR:\\1\\.map\\((\\w+)=>\\(0,(\\w+)\\.'+helper+'\\)\\(\\2\\)\\)\\}:\\{id:\\{in:\\[\\]\\}\\}', 'g');
      assert.equal([...module.matchAll(pattern)].length, 1, kind + ' filter must be unique in ' + file);
      module = module.replace(pattern, (_all, scopes, row, service) => {
        const expression = `${scopes}.length?{AND:[{OR:${scopes}.map(${row}=>(0,${service}.${helper})(${row}))},{order:{source:"CASHIER"}}]}:{id:{in:[]}}`;
        queryEvidence.push({file,kind,expression,scopes,service,helper});
        counts[kind === 'payment' ? 'paymentFilters' : 'refundFilters']++;
        return 'where:' + expression;
      });
    }
    body = body.slice(0,start) + module + body.slice(end);
    counts.financeModules++;
  }
  const cashierAnchor = '{href:"/cashier/profile",label:"Профиль",exact:!1,mobile:!0}';
  if (body.includes(cashierAnchor)) {
    assert.equal(body.split(cashierAnchor).length-1,1);
    body = body.replace(cashierAnchor, '{href:"/cashier/shift",label:"Отчёт",exact:!1,mobile:!0},'+cashierAnchor);
    counts[file.startsWith('.next/static/') ? 'cashierClient':'cashierServer']++;
  }
  const adminAnchor = '{href:"/admin/analytics",label:"Аналитика"}';
  if (body.includes(adminAnchor)) {
    assert.equal(body.split(adminAnchor).length-1,1);
    body = body.replace(adminAnchor, adminAnchor+',{href:"/admin/analytics?source=CASHIER",label:"Заполнить отчёт"}');
    counts[file.startsWith('.next/static/') ? 'adminClient':'adminServer']++;
  }
  if (body.includes('Выручка и расходы всех доступных вам локаций.')) {
    body = body.replaceAll('Выручка и расходы всех доступных вам локаций.','Кассовая выручка и расходы доступных вам локаций. Онлайн-заказы не включены.')
      .replaceAll('Терминал, сайт и ручные продажи','Терминал и ручные продажи · без онлайн-заказов')
      .replaceAll('/director/analytics#report-entry','/director/analytics?source=CASHIER#report-entry');
    counts[file.startsWith('.next/static/') ? 'financeClient':'financeServer']++;
  }
  if (file.endsWith('.css') && body.includes('.cashier-bottom-nav{display:grid;grid-template-columns:repeat(5,1fr)')) {
    body = body.replace('.cashier-bottom-nav{display:grid;grid-template-columns:repeat(5,1fr)', '.cashier-bottom-nav{display:grid;grid-template-columns:repeat(6,minmax(0,1fr))');
    counts.mobileCss++;
  }
  files.set(file,body);
}
assert.ok(counts.financeModules >= 1);
assert.equal(counts.paymentFilters,counts.financeModules);
assert.equal(counts.refundFilters,counts.financeModules);
for (const key of ['cashierClient','cashierServer','adminClient','adminServer','financeClient','financeServer','mobileCss']) assert.equal(counts[key],1,key);
// Verify the actual generated Prisma WHERE expressions, not a mirror helper.
for (const q of queryEvidence) {
  const evaluate = new Function(q.scopes,q.service,'return ('+q.expression+');');
  const service = {[q.helper]:scope=>({locationId:scope.id,paidAt:{gte:'from',lte:'to'},status:'SUCCEEDED'})};
  const empty = evaluate([],service);
  assert.deepEqual(empty,{id:{in:[]}});
  const where = evaluate([{id:'A'},{id:'B'}],service);
  assert.deepEqual(where.AND[1],{order:{source:'CASHIER'}});
  assert.deepEqual(where.AND[0].OR.map(x=>x.locationId),['A','B']);
  const match = (node,row) => {
    if (node.AND) return node.AND.every(x=>match(x,row));
    if (node.OR) return node.OR.some(x=>match(x,row));
    if (node.order) return row.source === node.order.source;
    return node.locationId === row.locationId && node.status === row.status;
  };
  assert.equal(match(where,{source:'ONLINE',locationId:'A',status:'SUCCEEDED'}),false);
  assert.equal(match(where,{source:'CASHIER',locationId:'A',status:'SUCCEEDED'}),true);
  assert.equal(match(where,{source:'CASHIER',locationId:'outside',status:'SUCCEEDED'}),false);
  assert.equal(match(where,{source:'CASHIER',locationId:'A',status:'PENDING'}),false);
}
const renamed = [];
for (let pass=0;pass<12;pass++) {
  const changes=[];
  for (const [file,body] of files) {
    if (!file.startsWith('.next/static/') || originals.get(file) === body) continue;
    const match = file.match(/(?:-|\/)([a-f0-9]{16,32})\.(?:js|css)$/);
    if (!match) continue;
    const next = hash(body).slice(0,match[1].length);
    if (match[1]!==next) changes.push({file,oldHash:match[1],newHash:next,to:file.replace(match[1],next)});
  }
  if (!changes.length) break;
  assert.ok(pass<11,'Asset reference convergence');
  for (const change of changes) { const body=files.get(change.file);files.delete(change.file);files.set(change.to,body);renamed.push(change); }
  for (const [file,original] of files) { let body=original;for (const change of changes) body=body.replaceAll(change.oldHash,change.newHash);files.set(file,body); }
}
const output=[];
for (const [file,body] of files) {
  if (originals.get(file)===body) continue;
  if (file.endsWith('.json')) JSON.parse(body);
  const dest=path.join(root,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,body);
  if(file.endsWith('.js')) cp.execFileSync(process.execPath,['--check',dest],{stdio:'pipe'});
  output.push({path:file,sha256:hash(body),bytes:Buffer.byteLength(body)});
}
const manifest={releaseId,sourceCommit:commit,baseImageDigest:baseDigest,builtAt:new Date().toISOString(),counts,renamedAssets:renamed,files:output,databaseMigrations:false,scope:'Exclude ONLINE payments and refunds from director finance and PDF; preserve other onsite revenue; expose existing role-specific report forms'};
fs.mkdirSync(path.join(root,'public'),{recursive:true});
fs.writeFileSync(path.join(root,'public/crm-release.json'),JSON.stringify(manifest,null,2)+'\n');
output.push({path:'public/crm-release.json'});
fs.writeFileSync(path.join(root,'crm-overlay-files.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({releaseId,counts,files:output.length,filterTests:queryEvidence.length*6,syntaxChecks:'passed'}));
