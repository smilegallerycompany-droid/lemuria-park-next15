'use strict';
const SAFE='[Сейф] ';
const EXPENSE_KINDS=['SALARY','ADVANCE','COMMISSION','TEMP_STAFF','EXPENSE','LEAFLET'];
const normalName=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
function prepareEntry(entry){
  if(entry.method!=='CASH'||!EXPENSE_KINDS.includes(entry.kind))return entry;
  if(entry.note.startsWith(SAFE))return entry;
  return {...entry,note:SAFE+entry.note};
}
function isSafe(entry){return entry.method==='CASH'&&EXPENSE_KINDS.includes(entry.kind)&&String(entry.note||'').startsWith(SAFE);}
function cashDelta(entry){return entry.method!=='CASH'||isSafe(entry)?0:entry.kind==='BALABAS_SALE'?entry.amountKopecks:EXPENSE_KINDS.includes(entry.kind)?-entry.amountKopecks:0;}
function allocate(amount,weights){
  const total=weights.reduce((s,x)=>s+x,0);if(!total)return weights.map(()=>0);
  const rows=weights.map((w,i)=>({i,value:Math.floor(amount*w/total),fraction:amount*w%total}));
  let left=amount-rows.reduce((s,x)=>s+x.value,0);for(const row of [...rows].sort((a,b)=>b.fraction-a.fraction||a.i-b.i)){if(left--<=0)break;row.value++;}
  return rows.map(x=>x.value);
}
function makeReport({payments=[],operations=[],refunds={total:0,cash:0,card:0,unknown:0},revenue}){
  const products=Object.fromEntries(['tickets','feed','photo','balabas'].map(k=>[k,{cash:0,card:0,total:0}]));
  const nominal=new Map(),seen=new Set();let refundedExtras=0;
  for(const payment of payments){
    const method=payment.method==='CASH'?'cash':'card',order=payment.order;
    const lines=[...order.items.map(x=>({...x,product:'tickets'})),...order.extras.map(x=>({...x,product:x.code==='FEED'?'feed':x.code==='PHOTO'?'photo':'balabas'}))];
    const amounts=allocate(payment.amount,lines.map(x=>x.subtotalAmount));
    lines.forEach((line,i)=>{
      products[line.product][method]+=amounts[i];products[line.product].total+=amounts[i];
      if(line.product==='tickets'){
        const key=JSON.stringify([line.ticketTypeName,line.unitPriceAmount]),row=nominal.get(key)||{name:line.ticketTypeName,nominal:line.unitPriceAmount,quantity:0,cash:0,card:0,total:0};
        const itemKey=order.id+':'+line.id;if(!seen.has(itemKey)){row.quantity+=line.quantity;seen.add(itemKey);}
        row[method]+=amounts[i];row.total+=amounts[i];nominal.set(key,row);
      }else if(order.status==='REFUNDED'&&['feed','photo'].includes(line.product))refundedExtras+=amounts[i];
    });
  }
  const ops=operations.filter(x=>!x.cancelledAt);
  for(const op of ops){if(!['FEED_SALE','BALABAS_SALE'].includes(op.kind))continue;const p=products[op.kind==='FEED_SALE'?'feed':'balabas'];p[op.method==='CASH'?'cash':'card']+=op.amountKopecks;p.total+=op.amountKopecks;}
  // Payment-based amounts remain authoritative, and zero-data reports still render.
  const total={cash:revenue?.cash??Object.values(products).reduce((s,x)=>s+x.cash,0),card:revenue?.card??Object.values(products).reduce((s,x)=>s+x.card,0)};total.total=total.cash+total.card;
  const netRevenue=total.total-refunds.total;
  const groups={expenses:{rows:[],total:0},temporary:{rows:[],total:0},salary:{rows:[],total:0}};
  for(const op of ops){const kind=op.kind;if(!EXPENSE_KINDS.includes(kind)||kind==='COMMISSION')continue;const group=groups[kind==='TEMP_STAFF'?'temporary':['SALARY','ADVANCE'].includes(kind)?'salary':'expenses'];group.rows.push(op);group.total+=op.amountKopecks;}
  const base=Math.max(0,products.feed.total+products.photo.total-refundedExtras),people=new Map();
  for(const op of ops.filter(x=>x.kind==='STAFF')){const key=normalName(op.person);if(key&&!people.has(key))people.set(key,{person:op.person.trim(),accrued:Math.round(base*5/100),paid:0});}
  for(const op of ops.filter(x=>x.kind==='COMMISSION')){const key=normalName(op.person);const row=people.get(key)||{person:op.person.trim(),accrued:0,paid:0};row.paid+=op.amountKopecks;people.set(key,row);}
  const commissionRows=[...people.values()].map(x=>({...x,balance:x.accrued-x.paid}));
  const commissions={rate:5,base,payments:ops.filter(x=>x.kind==='COMMISSION'),rows:commissionRows,accrued:commissionRows.reduce((s,x)=>s+x.accrued,0),paid:commissionRows.reduce((s,x)=>s+x.paid,0)};
  commissions.recognized=commissionRows.reduce((s,x)=>s+Math.max(x.accrued,x.paid),0);
  const costs=groups.expenses.total+groups.temporary.total+groups.salary.total+commissions.recognized;
  return {products,tickets:[...nominal.values()].sort((a,b)=>a.nominal-b.nominal||a.name.localeCompare(b.name,'ru')),total,refunds,netRevenue,...groups,commissions,costs,grossProfit:netRevenue-costs,staff:ops.filter(x=>x.kind==='STAFF'),temporaryStaff:ops.filter(x=>x.kind==='TEMP_STAFF_SHIFT'),manualSales:ops.filter(x=>['FEED_SALE','BALABAS_SALE'].includes(x.kind)),additional:ops.filter(x=>['INVITATION','FEED_RECEIPT','FEED_WRITE_OFF'].includes(x.kind))};
}
async function extend(tx,{operationWhere,paymentWhere,revenue,refunds}){
  const [operations,payments]=await Promise.all([
    tx.parkOperation.findMany({where:operationWhere,orderBy:[{date:'asc'},{createdAt:'asc'}],select:{id:true,date:true,kind:true,person:true,note:true,amountKopecks:true,quantity:true,method:true,createdAt:true,cancelledAt:true,location:{select:{name:true}},creator:{select:{name:true}},receipt:{select:{fileName:true}}}}),
    tx.payment.findMany({where:paymentWhere,select:{amount:true,method:true,order:{select:{id:true,status:true,items:{select:{id:true,ticketTypeName:true,unitPriceAmount:true,subtotalAmount:true,quantity:true}},extras:{select:{id:true,code:true,subtotalAmount:true,quantity:true,unitPriceAmount:true}}}}}})
  ]);
  return makeReport({operations,payments,revenue,refunds});
}
async function forShift(tx,summary){
  const shift=summary.shift;
  const rows=await tx.refund.findMany({where:{order:{shiftId:shift.id,source:'CASHIER'},status:{in:['SUCCEEDED','COMPLETED']}},select:{amount:true,payment:{select:{method:true}}}});
  const refunds={cash:0,card:0,unknown:0,total:0};for(const r of rows){refunds.total+=r.amount;refunds[!r.payment?'unknown':r.payment.method==='CASH'?'cash':'card']+=r.amount;}
  return extend(tx,{operationWhere:{shiftId:shift.id,cancelledAt:null},paymentWhere:{status:'SUCCEEDED',order:{shiftId:shift.id,source:'CASHIER'}},revenue:{cash:shift.cashSalesAmount+summary.reportTotals.cashSales,card:shift.cardSalesAmount+summary.reportTotals.cardSales},refunds});
}
function pdfBlocks(r){
 const m=x=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format((x||0)/100)+' ₽';
 const amounts=product=>[m(product.cash),m(product.card),m(product.total)];
 const block=(title,group)=>({title,headers:['Кому / назначение','Источник','Сумма'],rows:group.rows.map(x=>[x.person||x.note||'Расход',x.method==='CARD'?'Безналичные':isSafe(x)?'Наличные из сейфа':'Наличные из кассы',m(x.amountKopecks)])});
 return [
  {title:'1. Билеты по номиналу',headers:['Билет','Номинал','Кол-во','Наличные','Безналичные','Итого'],rows:r.tickets.map(x=>[x.name,m(x.nominal),String(x.quantity),m(x.cash),m(x.card),m(x.total)])},
  {text:'Билеты: '+amounts(r.products.tickets).join(' / ')},
  ...[['2. Корм','feed'],['3. Фото','photo'],['4. Балабас','balabas']].map(([title,key])=>({title,headers:['Наличные','Безналичные','Итого'],rows:[amounts(r.products[key])]})),
  {title:'5. Общая сумма',headers:['Наличные','Безналичные','Итого'],rows:[amounts(r.total)]},
  {text:'Возвраты: '+m(r.refunds.total)+'. После возвратов: '+m(r.netRevenue)},
  block('6. Расходы',r.expenses),{text:'Итого расходы: '+m(r.expenses.total)},
  {title:'7. Временные сотрудники',headers:['Сотрудник','Позиция'],rows:r.temporaryStaff.map(x=>[x.person,x.note])},block('Выплаты временным сотрудникам',r.temporary),{text:'Итого: '+m(r.temporary.total)},
  {title:'8. Зарплата штата',headers:['Сотрудник','Позиция'],rows:r.staff.map(x=>[x.person,x.note])},block('Зарплата и авансы',r.salary),{text:'Итого: '+m(r.salary.total)},
  {title:'9. Процент штата',text:'5% каждому постоянному сотруднику от корма и фото. База: '+m(r.commissions.base),headers:['Кому','Начислено','Выдано','Остаток'],rows:r.commissions.rows.map(x=>[x.person,m(x.accrued),m(x.paid),m(x.balance)])},
  {text:'Всего начислено: '+m(r.commissions.accrued)+'. Выдано: '+m(r.commissions.paid)},
  {title:'10. Общая валовая прибыль',text:m(r.grossProfit),emphasis:true},
  {text:'После возвратов, расходов, выплат временным сотрудникам, зарплаты и процентов штата. Выданные проценты учитываются один раз.'}
 ];
}
module.exports={SAFE,EXPENSE_KINDS,prepareEntry,isSafe,cashDelta,allocate,makeReport,extend,forShift,pdfBlocks};
