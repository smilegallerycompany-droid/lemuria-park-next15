'use strict';
const SAFE='[Сейф] ';
const EXPENSE_KINDS=['SALARY','ADVANCE','COMMISSION','TEMP_STAFF','EXPENSE','LEAFLET'];
const normalName=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
const SARATOV_COMMISSION_START = '2026-11-11';
const SARATOV_COMMISSION_END = '2026-12-20';
const SARATOV_COMMISSION_RULE = 'С 11.11.2026 в Саратове: корм — по 5% Диме, Паше и Ане, выплата ежедневно. Фото — по 5% Диме и Паше, выплата собственником в конце выставки.';
const saratovDay = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Saratov', year:'numeric', month:'2-digit', day:'2-digit'});
const saratovRecipients = [
  {name:'Дима', keys:['дима'], earnsPhoto:true},
  {name:'Неклюдов Павел', keys:['паша', 'павел', 'неклюдов павел', 'павел неклюдов', 'неклюдов павел антонович', 'павел антонович неклюдов'], earnsPhoto:true},
  {name:'Аня', keys:['аня', 'анна'], earnsPhoto:false},
];

function usesSaratovCommission(slug, date) {
  return slug === 'saratov' && date >= SARATOV_COMMISSION_START && date <= SARATOV_COMMISSION_END;
}
function getSaratovPaymentDay(payment) {
  const timestamp = payment.createdAt ?? payment.order.createdAt;
  return timestamp && saratovDay.format(new Date(timestamp));
}
function personKey(name) {
  const key = normalName(name);
  return normalName(saratovRecipients.find(person => person.keys.includes(key))?.name ?? name);
}
function commissionRow(people, name, mergeSaratovAliases) {
  const key = mergeSaratovAliases ? personKey(name) : normalName(name);
  if (!people.has(key)) people.set(key, {person:name.trim(), accrued:0, paid:0, feedAccrued:0, photoAccrued:0});
  return people.get(key);
}
function accrueSaratovCommission(people, feed, photo) {
  for (const {name, earnsPhoto} of saratovRecipients) {
    const row = commissionRow(people, name, true);
    const feedAccrued = Math.round(feed * 0.05);
    const photoAccrued = earnsPhoto ? Math.round(photo * 0.05) : 0;
    row.feedAccrued += feedAccrued;
    row.photoAccrued += photoAccrued;
    row.accrued += feedAccrued + photoAccrued;
  }
}

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
function makeLiveReport({payments=[],operations=[],refunds={total:0,cash:0,card:0,unknown:0},revenue,includeSaratovCommission=false}){
  const products=Object.fromEntries(['tickets','feed','photo','balabas'].map(k=>[k,{cash:0,card:0,total:0}]));
  const nominal=new Map(),seen=new Set(),commissionBases=new Map(),saratovBases=new Map();
  let refundedExtras=0;
  const addBase = (shiftId, product, amount, slug, date) => {
    if (usesSaratovCommission(slug, date)) {
      const day = saratovBases.get(date) ?? {feed:0, photo:0};
      day[product] += amount;
      saratovBases.set(date, day);
      return;
    }
    const key = shiftId || 'unassigned';
    commissionBases.set(key, (commissionBases.get(key) || 0) + amount);
  };
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
      }else if(['feed','photo'].includes(line.product)){if(order.status==='REFUNDED')refundedExtras+=amounts[i];else addBase(order.shiftId,line.product,amounts[i],order.location?.slug,getSaratovPaymentDay(payment));}
    });
  }
  const ops=operations.filter(x=>!x.cancelledAt);
  for(const op of ops){if(!['FEED_SALE','BALABAS_SALE'].includes(op.kind))continue;const p=products[op.kind==='FEED_SALE'?'feed':'balabas'];p[op.method==='CASH'?'cash':'card']+=op.amountKopecks;p.total+=op.amountKopecks;if(op.kind==='FEED_SALE')addBase(op.shiftId,'feed',op.amountKopecks,op.location?.slug,op.date);}
  // Payment-based amounts remain authoritative, and zero-data reports still render.
  const total={cash:revenue?.cash??Object.values(products).reduce((s,x)=>s+x.cash,0),card:revenue?.card??Object.values(products).reduce((s,x)=>s+x.card,0)};total.total=total.cash+total.card;
  const netRevenue=total.total-refunds.total;
  const groups={expenses:{rows:[],total:0},temporary:{rows:[],total:0},salary:{rows:[],total:0}};
  for(const op of ops){const kind=op.kind;if(!EXPENSE_KINDS.includes(kind)||kind==='COMMISSION')continue;const group=groups[kind==='TEMP_STAFF'?'temporary':['SALARY','ADVANCE'].includes(kind)?'salary':'expenses'];group.rows.push(op);group.total+=op.amountKopecks;}
  const base=Math.max(0,products.feed.total+products.photo.total-refundedExtras),people=new Map();
  const hasSaratovCommission = includeSaratovCommission || saratovBases.size > 0 ||
    ops.some(op => usesSaratovCommission(op.location?.slug, op.date));
  const attendance=new Set();
  for (const op of ops.filter(x=>x.kind==='STAFF')) {
    const key = hasSaratovCommission ? personKey(op.person) : normalName(op.person);
    const scope = op.shiftId || 'unassigned';
    const attendanceKey = JSON.stringify([key, scope]);
    if (!key || attendance.has(attendanceKey) || usesSaratovCommission(op.location?.slug, op.date)) continue;
    attendance.add(attendanceKey);
    commissionRow(people, op.person, hasSaratovCommission).accrued += Math.round((commissionBases.get(scope) || 0) * 0.05);
  }
  for (const {feed,photo} of saratovBases.values()) accrueSaratovCommission(people, feed, photo);
  for (const op of ops.filter(x=>x.kind==='COMMISSION')) {
    commissionRow(people, op.person, hasSaratovCommission).paid += op.amountKopecks;
  }
  const commissionRows=[...people.values()].map(x=>({...x,balance:x.accrued-x.paid}));
  const commissions={rate:5,base,hasSaratovCommission,rule:hasSaratovCommission ? SARATOV_COMMISSION_RULE : null,payments:ops.filter(x=>x.kind==='COMMISSION'),rows:commissionRows,accrued:commissionRows.reduce((s,x)=>s+x.accrued,0),paid:commissionRows.reduce((s,x)=>s+x.paid,0)};
  commissions.recognized=commissionRows.reduce((s,x)=>s+Math.max(x.accrued,x.paid),0);
  const costs=groups.expenses.total+groups.temporary.total+groups.salary.total+commissions.recognized;
  return {products,tickets:[...nominal.values()].sort((a,b)=>a.nominal-b.nominal||a.name.localeCompare(b.name,'ru')),total,refunds,netRevenue,...groups,commissions,costs,grossProfit:netRevenue-costs,staff:ops.filter(x=>x.kind==='STAFF'),temporaryStaff:ops.filter(x=>x.kind==='TEMP_STAFF_SHIFT'),manualSales:ops.filter(x=>['FEED_SALE','BALABAS_SALE'].includes(x.kind)),additional:ops.filter(x=>['INVITATION','FEED_RECEIPT','FEED_WRITE_OFF'].includes(x.kind))};
}
function makeReport(input){return require('./paper-daily-policy.cjs').makePaperReport(input,makeLiveReport);}
async function extend(tx,{operationWhere,paymentWhere,revenue,refunds}){
  const [operations,payments]=await Promise.all([
    tx.parkOperation.findMany({where:operationWhere,orderBy:[{date:'asc'},{createdAt:'asc'}],select:{id:true,locationId:true,shiftId:true,date:true,kind:true,person:true,note:true,amountKopecks:true,quantity:true,method:true,createdAt:true,cancelledAt:true,location:{select:{name:true,slug:true}},creator:{select:{name:true}},receipt:{select:{fileName:true}}}}),
    tx.payment.findMany({where:paymentWhere,select:{id:true,createdAt:true,amount:true,method:true,order:{select:{id:true,locationId:true,location:{select:{slug:true}},createdAt:true,shiftId:true,status:true,items:{select:{id:true,ticketTypeName:true,unitPriceAmount:true,subtotalAmount:true,quantity:true}},extras:{select:{id:true,code:true,subtotalAmount:true,quantity:true,unitPriceAmount:true}}}}}})
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
 const m=x=>x===null?'Не указано':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format((x||0)/100)+' ₽';
 const amounts=product=>[m(product.cash),m(product.card),m(product.total)];
 const block=(title,group)=>({title,headers:['Кому / назначение','Источник','Сумма'],rows:group.rows.map(x=>[x.person||x.note||'Расход',x.method==='CARD'?'Безналичные':isSafe(x)?'Наличные из сейфа':'Наличные из кассы',m(x.amountKopecks)])});
 return [
  ...(r.paperDays?.length?[{text:'Исторические отчёты: '+r.paperDays.map(x=>x.date).join(', ')+'. Номиналы и нал/безнал по категориям не указаны на бумаге. Общий нал/безнал сохранён.'}]:[]),
  {title:'1. Билеты по номиналу',headers:['Билет','Номинал','Кол-во','Наличные','Безналичные','Итого'],rows:r.tickets.map(x=>[x.name,m(x.nominal),String(x.quantity),m(x.cash),m(x.card),m(x.total)])},
  {text:'Билеты: '+amounts(r.products.tickets).join(' / ')},
  ...[['2. Корм','feed'],['3. Фото','photo'],['4. Балабас','balabas']].map(([title,key])=>({title,headers:['Наличные','Безналичные','Итого'],rows:[amounts(r.products[key])]})),
  {title:'5. Общая сумма',headers:['Наличные','Безналичные','Итого'],rows:[amounts(r.total)]},
  {text:'Возвраты: '+m(r.refunds.total)+'. После возвратов: '+m(r.netRevenue)},
  block('6. Расходы',r.expenses),{text:'Итого расходы: '+m(r.expenses.total)},
  {title:'7. Временные сотрудники',headers:['Сотрудник','Позиция'],rows:r.temporaryStaff.map(x=>[x.person,x.note])},block('Выплаты временным сотрудникам',r.temporary),{text:'Итого: '+m(r.temporary.total)},
  {title:'8. Зарплата штата',headers:['Сотрудник','Позиция'],rows:r.staff.map(x=>[x.person,x.note])},block('Зарплата и авансы',r.salary),{text:'Итого: '+m(r.salary.total)},
  {title:'9. Процент штата',text:r.commissions.rule ?? ('5% каждому постоянному сотруднику от корма и фото за дни, включённые в отчёт. Общая база: '+m(r.commissions.base)),headers:r.commissions.hasSaratovCommission ? ['Кому','Корм с 11.11','Фото с 11.11','Начислено','Выдано','Остаток'] : ['Кому','Начислено','Выдано','Остаток'],rows:r.commissions.rows.map(x=>[x.person,...(r.commissions.hasSaratovCommission ? [m(x.feedAccrued),m(x.photoAccrued)] : []),m(x.accrued),m(x.paid),m(x.balance)])},
  {text:'Всего начислено: '+m(r.commissions.accrued)+'. Выдано: '+m(r.commissions.paid)},
  {title:'10. Общая валовая прибыль',text:m(r.grossProfit),emphasis:true},
  {text:'После возвратов, расходов, выплат временным сотрудникам, зарплаты и процентов штата. Выданные проценты учитываются один раз.'}
 ];
}
module.exports={usesSaratovCommission,personKey,commissionRow,accrueSaratovCommission,SAFE,EXPENSE_KINDS,prepareEntry,isSafe,cashDelta,allocate,makeReport,extend,forShift,pdfBlocks};
