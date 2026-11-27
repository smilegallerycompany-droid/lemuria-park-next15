'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Script}=require('node:vm');
const baseline=require('../docs/evotor/production-baseline-20261127.json');
const sales=require('./build-evotor-production-sales.cjs');
const capacity=require('./build-evotor-production-capacity.cjs');
const {prepareSchema}=require('./build-evotor-production-schema.cjs');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function once(s,a,b){assert.equal(s.split(a).length,2,'Unknown production fragment: '+a);return s.replace(a,()=>b);}
function build(source,dest){
 assert.ok(!fs.existsSync(dest),'Use a fresh output directory');
 const read=name=>fs.readFileSync(path.join(source,name),'utf8');
 for(const [name,expected]of Object.entries(baseline.files))assert.equal(hash(read(name)),expected,'Baseline changed: '+name);
 const files=new Map();
 const original=read('.next/server/app/api/cashier/sales/route.js');
 files.set('.next/server/app/api/cashier/sales/route.js',sales.patchSalesRoute(original));
 const endpoints={'/api/integrations/evotor/checkout':sales.makeTerminalRoute(original),'/api/cashier/sales/status':sales.makeStatusRoute(original)};
 const appPaths=JSON.parse(read('.next/server/app-paths-manifest.json'));
 const routes=JSON.parse(read('.next/app-path-routes-manifest.json'));
 for(const [endpoint,body]of Object.entries(endpoints)){
  const entry=endpoint+'/route';assert.ok(!appPaths[entry],'Route already exists');
  appPaths[entry]='app'+entry+'.js';routes[entry]=endpoint;
  files.set('.next/server/app'+entry+'.js',body);
  files.set('.next/server/app'+endpoint+'/route_client-reference-manifest.js',read('.next/server/app/api/cashier/sales/route_client-reference-manifest.js').replaceAll('/api/cashier/sales',endpoint));
 }
 files.set('.next/server/app-paths-manifest.json',JSON.stringify(appPaths));
 files.set('.next/app-path-routes-manifest.json',JSON.stringify(routes));
 for(const name of ['.next/server/chunks/670.js','.next/server/chunks/4654.js'])files.set(name,capacity.patchRepository(read(name)));
 let shifts=read('.next/server/chunks/7114.js');
 shifts=once(shifts,'let j=(0,g.pN)(a.closingCashAmount,d.expectedCashAmount);','if(await c.evotorCheckout.count({where:{state:{in:["QUEUED","CLAIMED"]},order:{shiftId:h.id}}}))throw new f.J("FORBIDDEN","Дождитесь результата оплаты Эвотора или выполните сверку перед закрытием смены");let j=(0,g.pN)(a.closingCashAmount,d.expectedCashAmount);');
 files.set('.next/server/chunks/7114.js',shifts);
 files.set('prisma/schema.prisma',prepareSchema(read('prisma/schema.prisma'),fs.readFileSync(path.join(__dirname,'../prisma/schema.prisma'),'utf8')));
 for(const file of ['evotor-production-sales.cjs','evotor-production-capacity.cjs','evotor-production-terminal.cjs','evotor-production-status.cjs'])files.set(file,fs.readFileSync(path.join(__dirname,file),'utf8'));
 for(const folder of ['20261127120000_evotor_checkout','20261127150000_evotor_receipt_snapshot'])files.set('prisma/migrations/'+folder+'/migration.sql',fs.readFileSync(path.join(__dirname,'../prisma/migrations',folder,'migration.sql'),'utf8'));
 const assets=JSON.parse(read('.next/app-build-manifest.json')).pages['/(cashier)/cashier/page'];
 const asset=assets.find(x=>x.includes('/app/(cashier)/cashier/page-'));assert.ok(asset,'Cashier page not found');
 let ui=read('.next/'+asset);
 ui=once(ui,'onClick:()=>e_("CARD_TERMINAL")','onClick:()=>e4("CARD_TERMINAL")');
 ui=once(ui,'onClick:()=>e_("CASH")','onClick:()=>e4("CASH")');
 ui=once(ui,'await (0,A.hk)({sessionPublicId:eY.publicId,items:eG,extras:eV,secondarySessionPublicId:eX?ea:void 0,paymentMethod:e,quoteFingerprint:eq.fingerprint,adultCompanionConfirmed:!0},n)',
 'await globalThis.LemuriaEvotor.pay({sessionPublicId:eY.publicId,items:eG,extras:eV,secondarySessionPublicId:eX?ea:void 0,paymentMethod:e,quoteFingerprint:eq.fingerprint,adultCompanionConfirmed:!0},eq.totalAmount,W.id)');
 ui=fs.readFileSync(path.join(__dirname,'evotor-browser-checkout.js'),'utf8')+'\n'+ui;
 files.set('.next/'+asset,ui);
 for(const [name,body]of files)if(name.endsWith('.js')||name.endsWith('.cjs'))new Script(body,{filename:name});
 fs.cpSync(source,dest,{recursive:true});
 for(const [name,body]of files){const output=path.join(dest,name);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,body);}
 const manifest={baseImageDigest:baseline.imageDigest,scope:'staging-ticket-sales-and-extras',notProductionReady:true,files:[...files].map(([name,body])=>({path:name,sha256:hash(body)}))};
 fs.writeFileSync(path.join(dest,'evotor-overlay-manifest.json'),JSON.stringify(manifest,null,2));return manifest;
}
module.exports={build};
if(require.main===module)console.log(JSON.stringify(build(path.resolve(process.argv[2]),path.resolve(process.argv[3])),null,2));
