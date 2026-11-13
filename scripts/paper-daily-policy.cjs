'use strict';
const assert=require('node:assert/strict');
const {usesSaratovCommission,personKey,commissionRow,accrueSaratovCommission}=require('./finance-report-policy.cjs');
const normal=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
const key=(location,date)=>String(location||'')+'|'+date;
const localDay=(value,zone)=>value?new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)):null;
function readPaper(op){
 const p=JSON.parse(op.note);assert.equal(p.version,1);assert.equal(p.source,'paper-daily');assert.equal(p.date,op.date);
 for(const n of [p.cash,p.card,p.ticketQuantity,...Object.values(p.products)])assert.ok(Number.isSafeInteger(n)&&n>=0);
 assert.deepEqual(Object.keys(p.products).sort(),['balabas','feed','photo','tickets']);
 assert.equal(p.cash+p.card,Object.values(p.products).reduce((a,b)=>a+b,0));assert.equal(op.amountKopecks,p.cash+p.card);
 assert.ok(Array.isArray(p.commissionPeople));assert.equal(new Set(p.commissionPeople.map(normal)).size,p.commissionPeople.length);
 assert.ok(p.commissionPeople.every(x=>typeof x==='string'&&x.trim()));
 return {...p,locationId:op.locationId,locationSlug:op.location?.slug,operationId:op.id};
}
function makePaperReport(input,live){
 const ops=(input.operations||[]).filter(x=>!x.cancelledAt),papers=ops.filter(x=>x.kind==='PAPER_DAILY').map(readPaper);
 if(!papers.length)return live(input);
 const byDay=new Map();for(const p of papers){const k=key(p.locationId,p.date);assert.ok(!byDay.has(k),'Duplicate paper day');byDay.set(k,p);}
 const isCoveredOp=x=>byDay.has(key(x.locationId,x.date));
 const overlaps=[];
 const payments=(input.payments||[]).filter(x=>{const date=localDay(x.createdAt||x.order?.createdAt,'Europe/Saratov');const covered=byDay.has(key(x.order?.locationId,date));if(covered)overlaps.push(x.id||x.order?.id);return !covered;});
 // Paper statements replace revenue for their location/day. They never create
 // orders, tickets, provider payments or fabricated nominal denominations.
 const clean=ops.filter(x=>!(isCoveredOp(x)&&['STAFF','FEED_SALE','BALABAS_SALE'].includes(x.kind)));
 const includeSaratovCommission = papers.some(p => usesSaratovCommission(p.locationSlug,p.date));
 const r=live({...input,payments,operations:clean,revenue:undefined,includeSaratovCommission});
 const keyForPerson = r.commissions.hasSaratovCommission ? personKey : normal;
 const people=new Map(r.commissions.rows.map(x=>[keyForPerson(x.person),{...x}]));
 for(const p of papers){
  r.total.cash+=p.cash;r.total.card+=p.card;r.total.total+=p.cash+p.card;
  for(const product of ['tickets','feed','photo','balabas']){
   const q=r.products[product];q.total+=p.products[product];
   if(product==='balabas'&&p.balabasCash===true){if(q.cash!==null)q.cash+=p.products[product];}
   else if(p.products[product]){q.cash=null;q.card=null;q.splitUnknown=true;}
  }
  r.tickets.push({name:'Бумажный отчёт '+p.date.split('-').reverse().join('.'),nominal:null,quantity:p.ticketQuantity,cash:null,card:null,total:p.products.tickets});
  const base=p.products.feed+p.products.photo;r.commissions.base+=base;
  if (usesSaratovCommission(p.locationSlug,p.date)) accrueSaratovCommission(people,p.products.feed,p.products.photo);
  else for (const person of p.commissionPeople) commissionRow(people,person,r.commissions.hasSaratovCommission).accrued += Math.round(base*0.05);
 }
 r.netRevenue=r.total.total-r.refunds.total;
 r.commissions.rows=[...people.values()].map(x=>({...x,balance:x.accrued-x.paid}));
 for(const field of ['accrued','paid'])r.commissions[field]=r.commissions.rows.reduce((sum,x)=>sum+x[field],0);
 r.commissions.recognized=r.commissions.rows.reduce((sum,x)=>sum+Math.max(x.accrued,x.paid),0);
 r.costs=r.expenses.total+r.temporary.total+r.salary.total+r.commissions.recognized;r.grossProfit=r.netRevenue-r.costs;
 r.staff=ops.filter(x=>x.kind==='STAFF');
 r.paperDays=papers.map(p=>({date:p.date,ticketQuantity:p.ticketQuantity,feed:p.feed,openingCash:p.openingCash,onlineVisitors:p.onlineVisitors,leafletVisitors:p.leafletVisitors,invitationVisitors:p.invitationVisitors,commissionPeople:p.commissionPeople}));
 r.paperRevenueOverlapCount=overlaps.length;
 return r;
}
module.exports={readPaper,makePaperReport};
