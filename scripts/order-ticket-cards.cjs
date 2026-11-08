'use strict';
const QR = require('qrcode/lib/core/qrcode');
function qrPath(token) {
  const q = QR.create(token, { errorCorrectionLevel: 'M' });
  let path = '';
  for (let y = 0; y < q.modules.size; y++) for (let x = 0; x < q.modules.size; x++) {
    if (q.modules.get(y, x)) path += `M${x+4} ${y+4}h1v1h-1z`;
  }
  return { path, size: q.modules.size + 8 };
}
function render(api, order) {
  if (!order || order.status !== 'PAID') return null;
  const tickets = Array.isArray(order.tickets) ? order.tickets : [];
  const h = api.jsxs;
  return h('section', { className: 'order-issued-tickets', style: {marginTop:24}, children: [
    h('h2', {children:'Ваши билеты'}),
    h('p', {children:'Покажите каждый QR-код сотруднику на входе. Повторная оплата не нужна.'}),
    ...tickets.map((ticket, i) => {
      const usable = ['VALID','USED'].includes(ticket.status) && typeof ticket.qrToken === 'string' && ticket.qrToken.length > 0;
      const qr = usable ? qrPath(ticket.qrToken) : null;
      return h('article', {key:ticket.publicId, className:'order-issued-ticket', style:{border:'1px solid #cad8c2',borderRadius:16,padding:20,marginBottom:16,breakInside:'avoid',background:'#fff',color:'#143d29'},children:[
        h('h3',{children:`Билет ${i+1} из ${tickets.length}`}),
        h('p',{children:`Заказ ${order.number} · ${order.session.localDate} · ${order.session.localTime}`}),
        qr ? h('svg',{role:'img','aria-label':`QR-код билета ${i+1}`,viewBox:`0 0 ${qr.size} ${qr.size}`,width:240,height:240,style:{display:'block',maxWidth:'100%',height:'auto',margin:'16px auto'},shapeRendering:'crispEdges',children:[
          h('rect',{width:qr.size,height:qr.size,fill:'#fff'}),h('path',{d:qr.path,fill:'#000'})
        ]}) : null,
        h('p',{style:{fontSize:12,overflowWrap:'anywhere'},children:ticket.publicId}),
        h('strong',{children:ticket.status==='VALID'?'Действителен':ticket.status==='USED'?'Уже использован':'Билет недействителен'})
      ]});
    }),
    tickets.length===0 ? h('p',{role:'status',children:'Оплата подтверждена, но билеты пока не получены. Обратитесь к сотруднику и назовите номер заказа.'}) : null,
    tickets.length>0 ? h('button',{type:'button',className:'button button-orange order-ticket-print',onClick:()=>window.print(),style:{minHeight:48,width:'100%'},children:'Распечатать / сохранить PDF'}) : null,
    h('style',{children:'@media print{form,.order-ticket-print,main>.container>a{display:none!important}.order-issued-ticket{break-inside:avoid}.order-issued-tickets svg{print-color-adjust:exact;-webkit-print-color-adjust:exact}body{background:white!important}}'})
  ]});
}
module.exports={render,qrPath};
