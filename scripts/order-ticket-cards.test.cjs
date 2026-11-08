'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={TextEncoder};vm.runInNewContext(fs.readFileSync(__dirname+'/order-ticket-cards.bundle.js','utf8'),ctx);const api={jsxs:(type,props)=>({type,props})};
const render=o=>ctx.LemuriaOrderTickets.render(api,o);const order={number:'TEST-ORDER',status:'PAID',session:{localDate:'2026-11-09',localTime:'13:30'},tickets:[{publicId:'test-1',qrToken:'synthetic-order-ticket-1',status:'VALID'},{publicId:'test-2',qrToken:'synthetic-order-ticket-2',status:'VALID'}]};
function nodes(n,t){if(!n||typeof n!=='object')return [];return [...(n.type===t?[n]:[]),...(Array.isArray(n.props?.children)?n.props.children:[n.props?.children]).flatMap(x=>nodes(x,t))];}
test('all issued tickets render with distinct QR codes',()=>{const out=render(order);assert.equal(nodes(out,'article').length,2);const q=nodes(out,'svg');assert.equal(q.length,2);assert.notEqual(nodes(q[0],'path')[0].props.d,nodes(q[1],'path')[0].props.d);assert.ok(q.every(x=>x.props.viewBox&&x.props.width===240));});
test('unpaid/refunded orders never show QR',()=>{for(const status of ['DRAFT','AWAITING_PAYMENT','CANCELLED','REFUNDED'])assert.equal(render({...order,status}),null);});
test('cancelled tickets never render usable codes',()=>assert.equal(nodes(render({...order,tickets:[{...order.tickets[0],status:'CANCELLED'}]}),'svg').length,0));
test('paid order with no tickets has honest recovery message',()=>{const out=render({...order,tickets:[]});assert.equal(nodes(out,'svg').length,0);assert.equal(nodes(out,'button').length,0);assert.ok(JSON.stringify(out).includes('Оплата подтверждена'));});
test('used ticket is labelled used',()=>assert.ok(JSON.stringify(render({...order,tickets:[{...order.tickets[0],status:'USED'}]})).includes('Уже использован')));
test('print action is local and makes no request',()=>{let calls=0;ctx.window={print:()=>calls++};nodes(render(order),'button')[0].props.onClick();assert.equal(calls,1);});
