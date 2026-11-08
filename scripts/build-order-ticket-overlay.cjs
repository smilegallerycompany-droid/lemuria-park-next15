'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const BASE='sha256:cbfe23d7bf337b788c6484020ff24cf08aa0c6541b1afddcfb927683a64a88ae';
function patchOrder(body,bundle){
  assert.equal(body.split('31723:(e,t,n)=>{"use strict";').length-1,1,'Observed order module required');
  const tail='})]})}):null]})})}function d()';
  assert.equal(body.split(tail).length-1,1,'Observed order result required');
  assert.ok(!body.includes('LemuriaOrderTickets'),'Already patched');
  return body.replace('31723:(e,t,n)=>{"use strict";','31723:(e,t,n)=>{"use strict";'+bundle+';')
    .replace(tail,'})]})}):null,LemuriaOrderTickets.render(r,u)]})})}function d()');
}
function build(root,commit){
  assert.match(commit,/^[a-f0-9]{40}$/);const prior=JSON.parse(fs.readFileSync(path.join(root,'public/crm-release.json'),'utf8'));
  assert.equal(prior.releaseId,'saratov-breaks-20261107-3e35c28f');
  const files=new Map(),originals=new Map();function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(js|json|css|html|rsc|meta|txt)$/.test(e.name)){const rel=path.relative(root,f),b=fs.readFileSync(f,'utf8');files.set(rel,b);originals.set(rel,b);}}}walk(path.join(root,'.next'));
  const original='.next/static/chunks/app/(public)/order/page-0e9869206e583dde.js';assert.ok(files.has(original));
  const bundle=fs.readFileSync(path.join(__dirname,'order-ticket-cards.bundle.js'),'utf8');const patched=patchOrder(files.get(original),bundle);
  const hash=s=>crypto.createHash('sha256').update(s).digest('hex');const newHash=hash(patched).slice(0,16),next=original.replace('0e9869206e583dde',newHash);
  files.delete(original);files.set(next,patched);
  for(const[f,s]of files)files.set(f,s.replaceAll('0e9869206e583dde',newHash));
  const output=[];for(const[f,s]of files){if(originals.get(f)===s)continue;const dest=path.join(root,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,s);if(f.endsWith('.js'))cp.execFileSync(process.execPath,['--check',dest]);if(f.endsWith('.json'))JSON.parse(s);output.push({path:f,sha256:hash(s),bytes:Buffer.byteLength(s)});}
  assert.ok(output.some(x=>x.path===next));const manifest={releaseId:'order-ticket-recovery-20261108-'+commit.slice(0,8),sourceCommit:commit,baseImageDigest:BASE,builtAt:new Date().toISOString(),scope:'Show existing paid-order QR tickets after number/email verification; local print/PDF; no database, order, payment or email changes',databaseMigrations:false,files:output};
  fs.writeFileSync(path.join(root,'public/crm-release.json'),JSON.stringify(manifest,null,2)+'\n');output.push({path:'public/crm-release.json'});fs.writeFileSync(path.join(root,'order-ticket-overlay-files.json'),JSON.stringify(output,null,2));return {releaseId:manifest.releaseId,files:output.length,counts:{orderClient:1},syntaxChecks:'passed'};
}
module.exports={BASE,patchOrder,build};if(require.main===module)console.log(JSON.stringify(build(path.resolve(process.argv[2]),process.argv[3])));
