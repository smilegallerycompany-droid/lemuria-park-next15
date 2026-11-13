'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),p=require('./finance-report-policy.cjs');
const paper=(date='2026-11-07')=>({id:'paper-'+date,locationId:'loc',date,kind:'PAPER_DAILY',amountKopecks:210000,quantity:2,method:'MIXED',person:'',note:JSON.stringify({version:1,source:'paper-daily',date,cash:110000,card:100000,ticketQuantity:2,products:{tickets:100000,feed:60000,photo:40000,balabas:10000},balabasCash:true,commissionPeople:['A','B'],feed:{opening:3,sold:2,writeOff:0,closing:1},openingCash:50000,onlineVisitors:1,leafletVisitors:0,invitationVisitors:0})});
const op=(id,kind,amount,person='',date='2026-11-07')=>({id,locationId:'loc',date,kind,amountKopecks:amount,person,method:'CASH',note:'[Сейф] Выплата',quantity:0});
test('paper revenue preserves unknown splits, exact totals and separate nominal total',()=>{const r=p.makeReport({operations:[paper()]});assert.deepEqual(r.total,{cash:110000,card:100000,total:210000});assert.equal(r.products.tickets.cash,null);assert.equal(r.products.feed.card,null);assert.equal(r.products.balabas.cash,10000);assert.equal(r.tickets[0].nominal,null);assert.equal(r.tickets[0].quantity,2);assert.equal(r.commissions.accrued,10000);assert.equal(r.grossProfit,200000);assert.ok(p.pdfBlocks(r)[1].rows[0].includes('Не указано'));});
test('paper recipients accrue commission independently of attendance; paid percentage deducted once',()=>{const r=p.makeReport({operations:[paper(),op('s','STAFF',0,'A'),op('x','TEMP_STAFF',30000,'X'),op('e','EXPENSE',10000),op('a','ADVANCE',20000,'A'),op('ca','COMMISSION',5000,'A'),op('cb','COMMISSION',5000,'B')]});assert.equal(r.commissions.accrued,10000);assert.equal(r.commissions.paid,10000);assert.equal(r.grossProfit,140000);assert.equal(r.staff.length,1);assert.ok(r.commissions.rows.every(x=>x.balance===0));});
test('multiple days sum once and commission follows each day',()=>{const r=p.makeReport({operations:[paper(),paper('2026-11-08')]});assert.equal(r.total.total,420000);assert.equal(r.tickets.reduce((s,x)=>s+x.quantity,0),4);assert.equal(r.commissions.accrued,20000);assert.equal(r.paperDays.length,2);});
test('covered live sales and manual feed are not counted twice',()=>{const payment={id:'p',createdAt:new Date('2026-11-07T10:00:00Z'),amount:100000,method:'CARD',order:{id:'o',locationId:'loc',shiftId:'s',status:'PAID',items:[{id:'i',ticketTypeName:'Adult',unitPriceAmount:100000,subtotalAmount:100000,quantity:1}],extras:[]}};const r=p.makeReport({payments:[payment],operations:[paper(),op('feed','FEED_SALE',60000)],revenue:{cash:999999,card:999999}});assert.equal(r.total.total,210000);assert.equal(r.paperRevenueOverlapCount,1);});
test('cancelled paper falls back to existing live report',()=>{assert.equal(p.makeReport({operations:[{...paper(),cancelledAt:new Date()}]}).total.total,0);});
test('invalid or duplicate paper sources fail rather than misstate totals',()=>{assert.throws(()=>p.makeReport({operations:[paper(),{...paper(),id:'other'}]}));assert.throws(()=>p.makeReport({operations:[{...paper(),amountKopecks:1}]}));});

test('a mixed period preserves historical paper payments and applies the new Saratov rules to later revenue', () => {
 const saratov = row => ({...row,location:{slug:'saratov'}});
 const report = p.makeReport({operations:[
  saratov(paper()),
  saratov(paper('2026-11-11')),
  saratov(op('ca','COMMISSION',5000,'A')),
  saratov(op('cb','COMMISSION',5000,'B')),
 ]});
 assert.equal(report.commissions.paid,10000);
 assert.equal(report.commissions.recognized,23000);
 assert.deepEqual(report.commissions.rows.map(x=>[x.person,x.accrued,x.paid]),[
  ['A',5000,5000],['B',5000,5000],['Дима',5000,0],['Неклюдов Павел',5000,0],['Аня',3000,0],
 ]);
 assert.equal(report.grossProfit,397000);
});
