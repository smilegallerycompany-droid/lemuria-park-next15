"use strict";
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const p=require('./build-crm-completion-overlay.cjs');
test('ticket contract adds timezone without changing filtering or fields',()=>{
 const source='AUTH;where:scope;session:{select:{startsAt:!0,location:{select:{id:!0,name:!0}}}};filter:status';
 assert.equal(p.patchTicketApi(source),'AUTH;where:scope;session:{select:{startsAt:!0,location:{select:{id:!0,name:!0,timezone:!0}}}};filter:status');
 assert.throws(()=>p.patchTicketApi(source+source));assert.throws(()=>p.patchTicketApi(p.patchTicketApi(source)));
});
test('actual ticket bundle uses timezone returned by the same session',()=>{
 const code=fs.readFileSync(process.env.LEMURIA_TICKETS_JS,'utf8'),patched=p.patchTickets(code);new vm.Script(patched);
 let modules;vm.runInNewContext(code,{self:{webpackChunk_N_E:{push:c=>{modules=c[1];}}}});
 const exp={},r=()=>{throw Error('Unexpected import');};r.d=(t,d)=>Object.keys(d).forEach(k=>Object.defineProperty(t,k,{get:d[k]}));modules[16382]({},exp,r);
 const m=patched.match(/\(0,(\w+)\.r6\)\((\w+).session.startsAt,\2.session.location\?\.timezone\?\?"Europe\/Moscow"\)/);assert.ok(m);
 const row={session:{startsAt:'2026-11-07T12:30:00Z',location:{timezone:'Europe/Saratov'}}};
 const display=()=>vm.runInNewContext(m[0],{[m[1]]:exp,[m[2]]:row});assert.match(display(),/16:30/);
 row.session.location.timezone='Europe/Moscow';assert.match(display(),/15:30/);assert.throws(()=>p.patchTickets(patched));
});
test('actual finance cards render ticket, add-on and net totals independently',()=>{
 const code=fs.readFileSync(process.env.LEMURIA_FINANCE_JS,'utf8'),m=p.financeHero(code),patched=p.patchFinance(code);new vm.Script(patched);
 const helper=code.match(/function (\w+)\(e\)\{let t=e.revenue.total-e.refunds.total,n=e.expenses.total;return\{revenue:t,expenses:n,profit:t-n\}\}/);assert.ok(helper);
 const net=vm.runInNewContext('('+helper[0]+')');
 const [,jsx,css,money,originalNet,data]=m;
 const moduleNames=[...money.matchAll(/[A-Za-z_$][\w$]*(?=\.O5)/g)].map(x=>x[0]);
 const netModule=originalNet.match(/\(0,(\w+)\.N5\)/)[1];
 const tree=patched.slice(patched.indexOf('children:"Выручка по билетам"')-100);
 const start=patched.lastIndexOf('(0,'+jsx+'.jsxs)("div",',patched.indexOf('children:"Выручка по билетам"'));
 const end=patched.indexOf(']}),(0,'+jsx+'.jsxs)("p",',start);
 // The cards wrapper also contains cash/card; take the first three complete nodes.
 const fragment=patched.slice(start,end);
 const create=(tag,props)=>({tag,...props}),scope={[jsx]:{jsx:create,jsxs:create},[css]:()=>({hero:'hero'}),[moduleNames[0]]:{O5:n=>n},[netModule]:{N5:net},[data]:{revenue:{tickets:100000,feed:30000,balabas:20000,photo:10000,total:160000,cash:160000,card:0},refunds:{total:20000},expenses:{total:5000}}};
 const nodes=vm.runInNewContext('['+fragment+']',scope);
 assert.equal(nodes[0].children[1].children,100000);assert.equal(nodes[1].children[1].children,60000);assert.equal(nodes[2].children[1].children,140000);
 assert.equal(scope[data].revenue.total,160000);assert.throws(()=>p.patchFinance(patched));
});
