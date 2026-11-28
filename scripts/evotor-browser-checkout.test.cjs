'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(require('node:path').join(__dirname,'evotor-browser-checkout.js'),'utf8');
function harness(outcome='FISCALIZED'){
 const store=new Map(),requests=[];let n=0;
 const context={crypto:{randomUUID:()=> 'test-key'},navigator:{locks:{request:async(_,__,fn)=>fn({})}},prompt:()=> '1000,00',setTimeout:()=>0,
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 document:{body:{appendChild(){}},createElement:()=>({style:{},setAttribute(){},remove(){}})},
 fetch:async(path,options)=>{requests.push({path,options,persisted:store.size>0});n++;
 const data=path.includes('/status')?{number:'1',status:outcome==='DECLINED'?'CANCELLED':'PAID',totalAmount:90000,evotorCheckout:{state:outcome}}:{number:'1',status:'AWAITING_PAYMENT'};
 return {ok:true,json:async()=>({ok:true,data})};}};
 vm.runInNewContext(code,context);return {context,store,requests,get count(){return n;}};
}
test('cash persists the immutable request before POST and waits for fiscal status',async()=>{
 const h=harness();const result=await h.context.LemuriaEvotor.pay({paymentMethod:'CASH'},90000,'shift');
 assert.equal(result.status,'PAID');assert.equal(h.requests.length,2);assert.ok(h.requests[0].persisted);
 assert.equal(JSON.parse(h.requests[0].options.body).cashReceived,100000);assert.equal(h.store.size,0);
});
test('card bypasses manual approval and never asks for received cash',async()=>{
 const h=harness();h.context.prompt=()=>{throw Error('Manual card confirmation forbidden');};
 await h.context.LemuriaEvotor.pay({paymentMethod:'CARD_TERMINAL'},90000,'shift');
 assert.equal(JSON.parse(h.requests[0].options.body).cashReceived,undefined);
});
test('decline is not treated as success',async()=>{
 const h=harness('DECLINED');await assert.rejects(h.context.LemuriaEvotor.pay({paymentMethod:'CARD_TERMINAL'},90000,'shift'),/отклонена/);assert.equal(h.store.size,0);
});
test('cancel before cash POST creates no queue or journal',async()=>{
 const h=harness();h.context.prompt=()=>null;await assert.rejects(h.context.LemuriaEvotor.pay({paymentMethod:'CASH'},90000,'shift'),/отменена/);assert.equal(h.count,0);assert.equal(h.store.size,0);
});
test('another tab holding payment lock cannot trigger a new POST',async()=>{
 const h=harness();h.context.navigator.locks.request=async(_,__,fn)=>fn(null);
 await assert.rejects(h.context.LemuriaEvotor.pay({paymentMethod:'CARD_TERMINAL'},90000,'shift'),/другой вкладке/);assert.equal(h.count,0);assert.equal(h.store.size,0);
});
test('existing pending order is recovered instead of sending a new cart',async()=>{
 const h=harness();h.store.set('lemuria.evotor.checkout.v1',JSON.stringify({version:1,key:'old',number:'1',body:{paymentMethod:'CASH'}}));
 await h.context.LemuriaEvotor.pay({paymentMethod:'CARD_TERMINAL'},90000,'shift');assert.equal(h.requests.length,1);assert.equal(h.requests[0].options.method,'GET');
});
