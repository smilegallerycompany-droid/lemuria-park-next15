'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const script=fs.readFileSync(require('node:path').join(__dirname,'../public/cookie-consent.js'),'utf8');
const KEY='lemuria-cookie-choice-v1';
function browser({stored=null,path='/',host='xn--80ajjjbhwgdz8k.xn--p1ai',blocked=false}={}){
 const elements={},scripts=[],events={},calls=[],removed=[];let reloads=0;
 function el(tag){return{tag,hidden:false,events:{},children:[],setAttribute(){},addEventListener(k,f){this.events[k]=f;},appendChild(x){this.children.push(x);if(x.id)elements[x.id]=x;if(x.tag==='script')scripts.push(x);},querySelector(k){return this.children.find(x=>x.selector===k)||(this.children.push({selector:k,events:{},addEventListener(k,f){this.events[k]=f;},focus(){}}),this.children.at(-1));},focus(){}};}
 const data=new Map(stored===null?[]:[[KEY,JSON.stringify(stored)]]);
 const document={readyState:'complete',head:el('head'),body:el('body'),createElement:el,getElementById:id=>elements[id]||null};
 Object.defineProperty(document,'cookie',{get:()=>'',set:v=>removed.push(v)});
 const location={hostname:host,pathname:path,origin:'https://'+host,reload(){reloads++;}};
 const window={addEventListener(k,f){events[k]=f;}};
 const localStorage={getItem:k=>{if(blocked)throw Error();return data.get(k)||null;},setItem:(k,v)=>{if(blocked)throw Error();data.set(k,v);}};
 vm.runInNewContext(script,{window,document,location,localStorage,Date,Number});
 return{elements,scripts,data,events,window,click(selector){elements['lemuria-cookie-panel'].querySelector(selector).events.click();},get reloads(){return reloads;},choices(){return JSON.parse(data.get(KEY));}};
}
const stored=analytics=>({version:'2026-11-10',analytics,savedAt:Date.now()});
test('first visit does not load analytics and offers choices',()=>{const b=browser();assert.equal(b.scripts.length,0);assert.equal(b.elements['lemuria-cookie-panel'].hidden,false);});
test('closing means necessary only and persists the choice',()=>{const b=browser();b.click('.lc-close');assert.equal(b.scripts.length,0);assert.equal(b.choices().analytics,false);assert.equal(b.elements['lemuria-cookie-panel'].hidden,true);});
test('accept loads one counter and does not record forms or full URLs',()=>{const b=browser();b.click('.lc-accept');b.click('.lc-accept');assert.equal(b.scripts.length,1);const init=b.window.ym.a[0];assert.equal(init[0],113976341);assert.equal(init[2].webvisor,false);assert.equal(init[2].url,'https://xn--80ajjjbhwgdz8k.xn--p1ai/');});
test('remembered refusal never loads counter',()=>{const b=browser({stored:stored(false)});assert.equal(b.scripts.length,0);assert.equal(b.elements['lemuria-cookie-panel'].hidden,true);});
test('remembered opt-in loads counter',()=>{assert.equal(browser({stored:stored(true)}).scripts.length,1);});
test('withdrawal persists refusal, destroys counter and reloads',()=>{const b=browser({stored:stored(true)});b.click('.lc-essential');assert.equal(b.choices().analytics,false);assert.equal(b.reloads,1);assert.equal(b.window.ym.a[1][1],'destruct');});
test('expired and future-dated choices are not consent',()=>{for(const savedAt of [Date.now()-181*86400000,Date.now()+86400000]){const b=browser({stored:{version:'2026-11-10',analytics:true,savedAt}});assert.equal(b.scripts.length,0);assert.equal(b.elements['lemuria-cookie-panel'].hidden,false);}});
test('disabled storage does not grant consent or crash',()=>{const b=browser({blocked:true});assert.equal(b.scripts.length,0);b.click('.lc-essential');assert.equal(b.scripts.length,0);});
test('private and order pages never mount counter or banner',()=>{for(const path of ['/director/finance','/cashier','/checkout','/order/123','/tickets/abc'])assert.deepEqual(browser({path,stored:stored(true)}).elements,{});});
test('staging cannot send analytics even on opt-in',()=>{const b=browser({host:'staging.example.invalid'});b.click('.lc-accept');assert.equal(b.scripts.length,0);});
test('map placeholder has no automatically fetched third-party resource',()=>{const {mapDocument}=require('./cookie-policy.cjs');const html=mapDocument('https://yandex.ru/map-widget/v1/?a=1&b=2');assert.ok(!/<(?:iframe|script|img)\b/.test(html));assert.ok(html.includes('href="https://yandex.ru/map-widget/v1/?a=1&amp;b=2"'));assert.ok(html.includes('Показать карту'));});
