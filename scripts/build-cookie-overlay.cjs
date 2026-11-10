'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {policyCookieText,mapDocument}=require('./cookie-policy.cjs');
const root=path.resolve(process.argv[2]),commit=process.argv[3];assert.match(commit,/^[a-f0-9]{40}$/);
const release=JSON.parse(fs.readFileSync(path.join(root,'public/crm-release.json')));assert.equal(release.sourceCommit,'47bc0f4307ab042e376b18c880f79faf2c57fc12');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const files=new Map(),originals=new Map();function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(js|json|css|html|rsc|meta|txt)$/.test(e.name)){const rel=path.relative(root,f),s=fs.readFileSync(f,'utf8');files.set(rel,s);originals.set(rel,s);}}}walk(path.join(root,'.next'));
const manifest=JSON.parse(files.get('.next/app-build-manifest.json'));
const main=manifest.pages['/layout'].filter(p=>/\/main-app-[a-f0-9]+\.js$/.test(p));assert.equal(main.length,1);
const mf='.next/'+main[0],old=files.get(mf),marker='\n;(()=>{try{document.documentElement.dataset.lemuriaRelease=';
assert.ok(old.includes('lemuria-cookie-choice-v1'),'Expected existing cookie release');
assert.ok(!old.includes('window.__lemuriaMetrika113976341'),'Unconditional analytics must be removed');
let policyCount=0,mapCount=0,serverMapCount=0;
for(const[f,original]of files){
 let s=original;
 if(f.endsWith('.js')&&s.includes('Сайт может использовать технически необходимые cookie')){
  const before='Сайт может использовать технически необходимые cookie для работы бронирования, безопасности и сохранения состояния. Рекламные cookie не используются без отдельного уведомления и требуемого согласия. Ограничение cookie в браузере может нарушить работу отдельных функций сайта.';
  assert.equal(s.split(before).length-1,1);s=s.replace(before,policyCookieText);policyCount++;
 }
 if(f.endsWith('.js')&&s.includes('location-map-embed-footer')){
  s=s.replace(/"iframe",\{src:(\w+),title:("Карта: "|`Карта: )/g,(_,name,label)=>{mapCount++;if(f.startsWith(".next/server/"))serverMapCount++;return '"iframe",{srcDoc:('+mapDocument.toString()+')('+name+'),title:'+label;});
 }
 if(s!==original)files.set(f,s);
}
assert.equal(policyCount,0);assert.ok(serverMapCount>=1,'Patch the server map renderer as well as the client');
for(const[f,s]of files){if(f.endsWith('.js'))assert.ok(!/"iframe",\{src:\w+,title:(?:"Карта: "|`Карта: )/.test(s),'Ungated map remains: '+f);}
// No other executed client or server entry may contain an unconditional analytics loader.
for(const[f,s]of files){if(f!==mf&&f.endsWith('.js')&&s.includes('mc.yandex.ru/metrika/tag.js')){
 // Old hashed chunks remain in the base but must be unreferenced; active entry is replaced above.
 assert.ok(f.startsWith('.next/static/chunks/main-app-'),'Unexpected second analytics loader: '+f);
}}
for(let pass=0;pass<14;pass++){
 const changes=[];for(const[f,s]of files){if(!f.startsWith('.next/static/')||originals.get(f)===s)continue;const m=f.match(/(?:-|\/)([a-f0-9]{16,32})\.(?:js|css)$/);if(!m)continue;const next=hash(s).slice(0,m[1].length);if(next!==m[1])changes.push({file:f,old:m[1],next,to:f.replace(m[1],next)});}if(!changes.length)break;assert.ok(pass<13);
 for(const c of changes){const s=files.get(c.file);files.delete(c.file);files.set(c.to,s);}for(const[f,s]of files){let b=s;for(const c of changes)b=b.replaceAll(c.old,c.next);files.set(f,b);}
}
for(const name of ['cookie-consent.js','cookies.html'])files.set('public/'+name,fs.readFileSync(path.join(__dirname,'../public',name),'utf8'));
const output=[];for(const[f,s]of files){if(originals.get(f)===s)continue;const dest=path.join(root,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,s);if(/\.(js|cjs)$/.test(f))cp.execFileSync(process.execPath,['--check',dest]);if(f.endsWith('.json'))JSON.parse(s);output.push({path:f,sha256:hash(s),bytes:Buffer.byteLength(s)});}
const result={releaseId:'cookie-consent-20261110-'+commit.slice(0,8),sourceCommit:commit,baseImageDigest:'sha256:da2521116177791e7f1b143dea68057ea51cdb2f6e3f54e3447af8d34d00475e',previousRelease:release.releaseId,files:output,databaseMigrations:false,scope:'Cookie consent, opt-in analytics, on-demand map, policy supplement; preserves CRM and orders'};
fs.writeFileSync(path.join(root,'public/privacy-release.json'),JSON.stringify(result));output.push({path:'public/privacy-release.json'});fs.writeFileSync(path.join(root,'cookie-overlay-files.json'),JSON.stringify(output));console.log(JSON.stringify({releaseId:result.releaseId,cookieBundle:1,policyCount,mapCount,serverMapCount,files:output.length}));
