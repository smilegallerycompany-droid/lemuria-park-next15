'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {patchCashier,patchCss}=require('./build-crm-mobile-overlay.cjs');
const source=fs.readFileSync(process.argv[2]||'/tmp/lemuria-cashier-mobile/page-2e650817afb8aa26.js','utf8');
const patched=patchCashier(source);
for(const [width,reduced]of [[340,false],[390,true],[768,false],[1024,false],[1440,false]])test(`session selection at ${width}px, reduced=${reduced}`,()=>{
 const calls=[],frames=[];const panel={scrollIntoView:o=>calls.push(['scroll',o]),focus:o=>calls.push(['focus',o])};
 const handler=patched.match(/onClick:\(\)=>\{eh\(e\.publicId\)[\s\S]*?\},className:/)[0].slice('onClick:'.length,-',className:'.length);
 const fn=vm.runInNewContext('('+handler+')',{eh:x=>calls.push(['select',x]),ef:x=>calls.push(['clear',x]),eE:x=>calls.push(['error',x]),e:{publicId:'SESSION_FIXTURE'},window:{innerWidth:width,requestAnimationFrame:fn=>frames.push(fn),matchMedia:()=>({matches:reduced})},document:{getElementById:id=>{assert.equal(id,'cashier-sale-panel');return panel}}});
 fn();assert.deepEqual(calls.map(c=>c[0]),['select','clear','error']);assert.equal(calls[0][1],'SESSION_FIXTURE');
 frames.forEach(fn=>fn());assert.equal(calls.length,width<1024?5:3);
 if(width<1024){assert.equal(calls[3][1].behavior,reduced?'auto':'smooth');assert.equal(calls[4][1].preventScroll,true)}
});
test('sale and payment function preserved byte-for-byte',()=>{
 const start=source.indexOf('async function');
 // The only changes to JS are the selected-session click, aside attributes and return button.
 const originalPayment=source.match(/onClick:\(\)=>e_\("CASH"\)/)[0];assert.ok(patched.includes(originalPayment));
 assert.ok(patched.includes('onClick:()=>e_("CARD_TERMINAL")'));
 const originalSale=source.slice(source.indexOf('crypto.randomUUID()')-150,source.indexOf('crypto.randomUUID()')+1500);assert.ok(patched.includes(originalSale));
 assert.equal((patched.match(/id:"cashier-sale-panel"/g)||[]).length,1);
 assert.ok(patched.includes('tabIndex:-1'));assert.ok(patched.includes('Выбрать другой сеанс'));
});
test('patch refuses already changed or unknown source',()=>{assert.throws(()=>patchCashier(patched));assert.throws(()=>patchCashier('unknown'))});
test('mobile CSS has 44px touch targets and 16px form controls',()=>{const css=patchCss('.cashier-home-aside{min-width:0}');assert.ok(css.includes('min-height:44px'));assert.ok(css.includes('font-size:16px'));assert.ok(css.includes('scroll-margin-top:96px'))});
