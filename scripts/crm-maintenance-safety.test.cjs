"use strict";
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup({sales=0,orders=false,cashType='OPENING',dbName='lemuria'}={}){
 const shifts=[['a','2026-09-17'],['b','2026-09-17'],['c','2026-10-22']].map(([id,d])=>({id,status:'OPEN',openedAt:new Date(d+'T12:00:00Z'),closedAt:null,cashSalesAmount:sales,cardSalesAmount:0,onlineSalesAmount:0,cashRefundsAmount:0,ordersCount:0,ticketsCount:0}));
 const cash=shifts.map(s=>({id:'cash-'+s.id,shiftId:s.id,type:cashType,orderId:null,parkOperationId:null})),events=[];
 const models=[{name:'CashierShift',fields:[]},...['CashOperation','Order','ParkOperation'].map(name=>({name,fields:[{kind:'object',type:'CashierShift',relationFromFields:['shiftId']}]}))];
 const tx={
  $queryRawUnsafe:async sql=>sql.startsWith('SELECT current_database')?[{name:dbName}]:[],
  $executeRawUnsafe:async()=>{},
  cashierShift:{findMany:async()=>shifts,deleteMany:async()=>{events.push('delete-shifts');return{count:3};},count:async()=>0},
  cashOperation:{findMany:async()=>cash,deleteMany:async()=>{events.push('delete-cash');return{count:3};}},
  order:{findMany:async()=>orders?[{id:'real-order'}]:[]},parkOperation:{findMany:async()=>[],deleteMany:async()=>({count:0})},
  auditLog:{create:async({data})=>{events.push('backup');assert.equal(data.before.tables.CashierShift.length,3);return{id:'backup'};}}
 };
 const fake={$transaction:async cb=>cb(tx)};
 const mod={exports:{}},source=fs.readFileSync(require.resolve('./crm-completion-maintenance-worker.cjs'),'utf8');
 function req(name){if(name==='/app/node_modules/@prisma/client')return{PrismaClient:function(){return fake;},Prisma:{dmmf:{datamodel:{models}}}};return require(name);}
 req.main={};const process={env:{QA_EXPECTED_DB:'lemuria',QA_ALLOW_TEST_SHIFT_DELETE:'1'}};
 vm.runInNewContext(source,{module:mod,require:req,process,console,Date});return{...mod.exports,tx,events,process};
}
test('refuses sales, real orders, non-opening cash and wrong database',async()=>{
 for(const options of [{sales:1},{orders:true},{cashType:'SALE'},{dbName:'other'}]){const a=setup(options);await assert.rejects(()=>a.collect(a.tx));assert.equal(a.events.length,0);}
});
test('deletion requires the reviewed snapshot and stores backup before deleting',async()=>{
 const a=setup(),p=await a.collect(a.tx);
 await assert.rejects(()=>a.removeTestShifts({planHash:'0'.repeat(64)}));assert.equal(a.events.length,0);
 const result=await a.removeTestShifts({planHash:p.planHash});assert.equal(result.removedShifts,3);assert.equal(result.productionOrdersChanged,0);assert.deepEqual(a.events,['backup','delete-cash','delete-shifts']);
});
test('backup hash survives JSONB object-key order normalization',()=>{
 const a=setup();assert.equal(a.hash({z:1,a:{q:3,b:2}}),a.hash({a:{b:2,q:3},z:1}));
});
