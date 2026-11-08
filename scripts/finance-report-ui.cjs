'use strict';
function render(api,data,options={}){
 if(!data)return null;const h=api.jsxs,money=x=>new Intl.NumberFormat('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:2}).format((x||0)/100)+' ₽';
 const section=(title,children)=>h('section',{style:{padding:20,margin:'18px 0',background:'#fff',border:'1px solid #d8e0d2',borderRadius:16},children:[h('h2',{children:title}),...children]});
 const table=(heads,rows)=>h('div',{style:{overflowX:'auto'},children:h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:14},children:[h('thead',{children:h('tr',{children:heads.map((x,i)=>h('th',{key:i,style:{textAlign:'left',padding:8,borderBottom:'1px solid #ccd6c6'},children:x}))})}),h('tbody',{children:rows.length?rows.map((row,i)=>h('tr',{key:i,children:row.map((x,j)=>h('td',{key:j,style:{padding:8,verticalAlign:'top',borderBottom:'1px solid #edf0e9',overflowWrap:'anywhere'},children:x}))})):h('tr',{children:h('td',{colSpan:heads.length,style:{padding:12},children:'Записей нет'})})})]})});
 const product=(title,key)=>section(title,[table(['Наличные','Безналичные','Итого'],[[money(data.products[key].cash),money(data.products[key].card),money(data.products[key].total)]])]);
 const rowAction=row=>options.entryActions?options.entryActions(row):null;
 const expenseRows=group=>table(['Кому / назначение','Источник','Сумма',''],group.rows.map(x=>[x.person||x.note||'Расход',x.method==='CARD'?'Безналичные':String(x.note||'').startsWith('[Сейф] ')?'Наличные из сейфа':'Наличные из кассы',money(x.amountKopecks),rowAction(x)]));
 const subtotal=amount=>h('p',{style:{fontWeight:800,fontSize:19},children:'Итого: '+money(amount)});
 const detailRows=rows=>table(['Запись','Примечание','Количество','Сумма',''],rows.map(x=>[x.person||({INVITATION:'Пригласительные',FEED_RECEIPT:'Поступление корма',FEED_WRITE_OFF:'Списание корма',FEED_SALE:'Продажа корма',BALABAS_SALE:'Балабас'}[x.kind])||x.kind,x.note||'—',x.quantity||'—',money(x.amountKopecks),rowAction(x)]));
 const staffTable=rows=>table(['Сотрудник','Позиция',''],rows.map(x=>[x.person,x.note||'—',rowAction(x)]));
 return h('div',{'data-testid':'finance-business-report',children:[
  section('1. Билеты по номиналу',[
   table(['Билет','Номинал','Количество','Наличные','Безналичные','Итого'],data.tickets.map(x=>[x.name,money(x.nominal),x.quantity,money(x.cash),money(x.card),money(x.total)])),
   table(['Наличные по билетам','Безналичные по билетам','Билеты всего'],[[money(data.products.tickets.cash),money(data.products.tickets.card),money(data.products.tickets.total)]])]),
  product('2. Корм','feed'),product('3. Фото','photo'),product('4. Балабас','balabas'),
  section('5. Общая сумма',[table(['Наличные','Безналичные','Общая сумма'],[[money(data.total.cash),money(data.total.card),money(data.total.total)]]),
   data.refunds.total?h('p',{children:'Возвраты: '+money(data.refunds.total)+'. После возвратов: '+money(data.netRevenue)}):null]),
  section('6. Расходы',[expenseRows(data.expenses),subtotal(data.expenses.total)]),
  section('7. Временные сотрудники',[staffTable(data.temporaryStaff),expenseRows(data.temporary),subtotal(data.temporary.total)]),
  section('8. Зарплата штата',[staffTable(data.staff),expenseRows(data.salary),subtotal(data.salary.total)]),
  section('9. Процент штата',[
   h('p',{children:'Каждому постоянному сотруднику: 5% от корма и фото в сменах, где он указан в составе. Общая база за выбранный период: '+money(data.commissions.base)+'.'}),
   table(['Сотрудник','Начислено 5%','Выдано','Осталось выдать'],data.commissions.rows.map(x=>[x.person,money(x.accrued),money(x.paid),money(x.balance)])),
   table(['Всего начислено','Всего выдано','Остаток'],[[money(data.commissions.accrued),money(data.commissions.paid),money(data.commissions.accrued-data.commissions.paid)]]),
   !data.staff.length?h('p',{role:'status',children:'Добавьте постоянных сотрудников в состав смены, чтобы рассчитать 5% по каждому.'}):null,
   h('p',{children:'Фактическую выдачу добавляйте видом «Процент штата (5%)». Начисление не означает, что деньги уже выданы.'}),expenseRows({rows:data.commissions.payments||[]})]),
  (data.manualSales?.length||data.additional?.length)?h('details',{style:{margin:'16px 0'},children:[h('summary',{children:'Дополнительные записи: ручные продажи, корм и пригласительные'}),detailRows([...(data.manualSales||[]),...(data.additional||[])])]}):null,
  section('10. Общая валовая прибыль',[h('strong',{style:{fontSize:28},children:money(data.grossProfit)}),h('p',{children:'Общая сумма после возвратов − расходы − выплаты временным сотрудникам − зарплата и авансы штата − процент штата. Выданные проценты учитываются один раз; выдача сверх начисления также включается в расходы.'})])
 ]});
}
module.exports={render};
