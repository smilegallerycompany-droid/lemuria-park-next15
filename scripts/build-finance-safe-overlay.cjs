'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const BASE='sha256:f0397810d5c91485b31d81f74384a84f03f0af67312eab5b70c7d23a1cce430f';
const POLICY='require("/app/finance-report-policy.cjs")';
function one(body,old,next,label){assert.equal(body.split(old).length-1,1,label);return body.replace(old,next);}
function patchService(s){
 const where='q.length?{AND:[{OR:q.map(a=>(0,h.vM)(a))},{order:{source:"CASHIER"}}]}:{id:{in:[]}}';
 s=one(s,'return{balances:',`const _businessReport=await ${POLICY}.extend(a,{operationWhere:r,paymentWhere:${where},revenue:u,refunds:v});return{businessReport:_businessReport,balances:`,'finance report extension');
 return one(s,'net:u.total-v.total-w.total','net:_businessReport.grossProfit','profit');
}
function patchShiftSchema(s){
 s=one(s,'});function k(a){','}).transform(a=>'+POLICY+'.prepareEntry(a));function k(a){','safe expense normalization');
 const i=s.indexOf('function k(a){');assert.ok(i>=0);return s.slice(0,i)+'function k(a){return '+POLICY+'.cashDelta(a)}}';
}
function patchShiftSummary(s){
 return one(s,'async function x(a){let b={shiftId:a.shift.id,source:"CASHIER"',`async function x(a){let result=await _lemuriaOriginalShiftView(a);result.businessReport=await ${POLICY}.forShift(d.z,a);return result}async function _lemuriaOriginalShiftView(a){let b={shiftId:a.shift.id,source:"CASHIER"`,'shift view extension');
}
function patchFinanceView(s){
 const i=s.search(/children:"01 \/ (?:Выручка|Билетная выручка и допродажи)"/);assert.ok(i>=0);
 const prior=s.slice(0,i),m=[...prior.matchAll(/\(0,(\w+)\.jsxs\)\("section",/g)].pop();assert.ok(m);
 const end=[...s.slice(i).matchAll(/\(0,(\w+)\.jsx\)\((\w+),\{data:(\w+)\.balances\}\)/g)][0];assert.ok(end,'balance footer');
 return s.slice(0,m.index)+`LemuriaFinanceUI.render(${m[1]},${end[3]}.businessReport),`+s.slice(i+end.index);
}
function patchShiftView(s){
 const re=/let\{report:(\w+),entryActions:(\w+)\}=(\w+),(\w+)=\1\.reportTotals;if\(!\4\)return null;/g;const matches=[...s.matchAll(re)];assert.equal(matches.length,1,'cashier business view');
 const jsx=[...s.slice(0,matches[0].index).matchAll(/var (\w+)=\w+\(95155\)/g)].pop()?.[1];assert.ok(jsx);
 return s.replace(re,(old,report,actions)=>old+`if(${report}.businessReport)return LemuriaFinanceUI.render(${jsx},${report}.businessReport,{entryActions:${actions}});`);
}
function mapModules(body,transform){
 const matches=[...body.matchAll(/(?:^|[,{])(\d{3,}):/g)];for(let i=matches.length-1;i>=0;i--){const m=matches[i],start=m.index+([',','{'].includes(body[m.index])?1:0),end=i+1<matches.length?matches[i+1].index:body.length;const old=body.slice(start,end),next=transform(m[1],old);if(next!==old)body=body.slice(0,start)+next+body.slice(end);}return body;
}
function build(root,commit){
 assert.match(commit,/^[a-f0-9]{40}$/);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'public/crm-release.json'))).releaseId,'order-ticket-recovery-20261108-b613567c');
 const files=new Map(),originals=new Map();function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(js|json|css|html|rsc|meta|txt)$/.test(e.name)){const rel=path.relative(root,f),s=fs.readFileSync(f,'utf8');files.set(rel,s);originals.set(rel,s);}}}walk(path.join(root,'.next'));
 const counts={service:0,shiftSchema:0,shiftSummary:0,financePdf:0,financeViews:0,shiftViews:0,entryForms:0};const ui=fs.readFileSync(path.join(__dirname,'finance-report-ui.bundle.js'),'utf8');
 for(const[f,old]of files){let s=old,uiNeeded=false;if(!f.endsWith('.js'))continue;
  s=mapModules(s,(id,m)=>{
   if(f.startsWith('.next/server/')&&id==='60664'&&m.includes('Отчёты доступны')){m=patchService(m);counts.service++;}
   if(f.startsWith('.next/server/')&&id==='55466'){m=patchShiftSchema(m);counts.shiftSchema++;}
   if(f.startsWith('.next/server/')&&id==='77114'){m=patchShiftSummary(m);counts.shiftSummary++;}
   if(id==='3743'&&m.includes('function j(a){let b=a.revenue.total'))m=m.replace('function j(a){','function j(a){if(a.businessReport)return{revenue:a.businessReport.netRevenue,expenses:a.businessReport.costs,profit:a.businessReport.grossProfit};');
   if(f.startsWith('.next/server/')&&id==='79875'&&m.includes('blocks:function(a){')){m=one(m,'blocks:function(a){','blocks:function(a){if(a.businessReport)return '+POLICY+'.pdfBlocks(a.businessReport);','finance PDF');counts.financePdf++;}
   return m;
  });
  if(/children:"01 \/ (?:Выручка|Билетная выручка и допродажи)"/.test(s)&&s.includes('.balances}')){s=patchFinanceView(s);uiNeeded=true;counts.financeViews++;}
  if(/let\{report:\w+,entryActions:\w+\}=/.test(s)&&s.includes('shift-business-report')){s=patchShiftView(s);uiNeeded=true;counts.shiftViews++;}
  if(s.includes('Наличными из этой кассы')){
   const kind=s.match(/kind:(\w+),amountKopecks:/)?.[1];assert.ok(kind);s=s.replaceAll('children:"Наличными из этой кассы"',`children:"BALABAS_SALE"===${kind}?"Наличные в кассу":"Наличными из сейфа"`);
   s=s.replaceAll('Наличная выплата автоматически вычитается из кассы — отдельно изымать её не нужно.','Наличные расходы, зарплата и проценты учитываются из сейфа и не уменьшают кассу текущей смены. Безналичные выплаты выбирайте только при фактическом переводе.');counts.entryForms++;
  }
  s=s.replaceAll('SALARY:"Зарплата",ADVANCE:', 'SALARY:"Зарплата",COMMISSION:"Процент штата (5%)",ADVANCE:').replaceAll('"SALARY","ADVANCE"','"SALARY","COMMISSION","ADVANCE"');
  if(uiNeeded)s=ui+';\n'+s;files.set(f,s);
 }
 for(const k of ['service','shiftSchema','shiftSummary','financePdf'])assert.equal(counts[k],1,k);assert.ok(counts.financeViews>=1&&counts.shiftViews>=1&&counts.entryForms>=1,JSON.stringify(counts));
 files.set('finance-report-policy.cjs',fs.readFileSync(path.join(__dirname,'finance-report-policy.cjs'),'utf8'));
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),renamed=[];
 for(let pass=0;pass<14;pass++){const changes=[];for(const[f,s]of files){if(!f.startsWith('.next/static/')||originals.get(f)===s)continue;const m=f.match(/(?:-|\/)([a-f0-9]{16,32})\.(?:js|css)$/);if(!m)continue;const next=hash(s).slice(0,m[1].length);if(next!==m[1])changes.push({file:f,old:m[1],next,to:f.replace(m[1],next)});}if(!changes.length)break;assert.ok(pass<13);for(const c of changes){const s=files.get(c.file);files.delete(c.file);files.set(c.to,s);renamed.push(c);}for(const[f,s]of files){let b=s;for(const c of changes)b=b.replaceAll(c.old,c.next);files.set(f,b);}}
 const output=[];for(const[f,s]of files){if(originals.get(f)===s)continue;const dest=path.join(root,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,s);if(f.endsWith('.js')||f.endsWith('.cjs'))cp.execFileSync(process.execPath,['--check',dest]);if(f.endsWith('.json'))JSON.parse(s);output.push({path:f,sha256:hash(s),bytes:Buffer.byteLength(s)});}
 const manifest={releaseId:'finance-safe-report-20261108-'+commit.slice(0,8),sourceCommit:commit,baseImageDigest:BASE,builtAt:new Date().toISOString(),counts,files:output,renamedAssets:renamed,databaseMigrations:false,scope:'Safe-funded cash expenses; itemized cash/card report; temporary staff, salaries and per-person 5% feed/photo commission; no historical financial rewrites'};
 fs.writeFileSync(path.join(root,'public/crm-release.json'),JSON.stringify(manifest,null,2));output.push({path:'public/crm-release.json'});fs.writeFileSync(path.join(root,'finance-safe-overlay-files.json'),JSON.stringify(output));return{releaseId:manifest.releaseId,counts,files:output.length,syntaxChecks:'passed'};
}
module.exports={BASE,patchService,patchShiftSchema,patchShiftSummary,patchFinanceView,patchShiftView,mapModules,build};if(require.main===module)console.log(JSON.stringify(build(path.resolve(process.argv[2]),process.argv[3])));
