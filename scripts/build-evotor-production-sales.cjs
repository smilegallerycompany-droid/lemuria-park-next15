"use strict";
const assert=require("node:assert/strict");
const {Script}=require("node:vm");
const POLICY='require("/app/evotor-production-sales.cjs")';
function once(body,needle,replacement){
  assert.equal(body.split(needle).length,2,"Unknown production sales: "+needle);
  return body.replace(needle,()=>replacement);
}
function patchSalesRoute(body){
  body=once(body,'d=w.yr.parse(c)', 'd='+POLICY+'.parseSale(c,value=>w.yr.parse(value),v.hD)');
  body=once(body,'paymentMethod:a.paymentMethod,customerName:a.customerName',
    'paymentMethod:a.paymentMethod,...void 0!==a.cashReceived?{cashReceived:a.cashReceived}:{},customerName:a.customerName');
  body=once(body,'s=await O.n.createCashierPaid(a,{', 's=await '+POLICY+'.createPending(a,{');
  body=once(body,'items:q,extras:p.extras}),t=q.reduce',
    'items:q,extras:p.extras},{quote:p,ticketTypes:m,cashReceived:b.cashReceived},O.n.createCashierPaid,void 0,v.hD),t=q.reduce');
  body=once(body,'return await (0,U.wS)(a,{shiftId:k.id,orderId:s.id',
    'if("AWAITING_PAYMENT"===s.status)return s;return await (0,U.wS)(a,{shiftId:k.id,orderId:s.id');
  new Script(body);
  return body;
}
function makeTerminalRoute(body){
  const endpoint="/api/integrations/evotor/checkout";
  body=once(body,'a.id=28,a.ids=[28]','a.id=99581001,a.ids=[99581001]');
  body=once(body,'54096:(a,b,c)','99581002:(a,b,c)');
  body=once(body,'b(b.s=54096)','b(b.s=99581002)');
  body=once(body,'require("../../../../webpack-runtime.js")','require("../../../../../webpack-runtime.js")');
  body=once(body,'c.d(d,{POST:()=>Z})',
    'c.d(d,{POST:()=>evotorPost});function evotorPost(request){return require("/app/evotor-production-terminal.cjs").handle(request,{prisma:A.z,recordAuditLog:C.xN,recordSaleOnShift:U.wS,issueTicketsForOrder:T.G,handleApiError:v.hS})}');
  body=body.replaceAll('/api/cashier/sales',endpoint);
  new Script(body);
  return body;
}
function makeStatusRoute(body){
  body=once(body,'a.id=28,a.ids=[28]','a.id=99581003,a.ids=[99581003]');
  body=once(body,'54096:(a,b,c)','99581004:(a,b,c)');
  body=once(body,'b(b.s=54096)','b(b.s=99581004)');
  body=once(body,'require("../../../../webpack-runtime.js")','require("../../../../../webpack-runtime.js")');
  body=once(body,'c.d(d,{POST:()=>Z})',
    'c.d(d,{GET:()=>evotorStatus});function evotorStatus(request){return require("/app/evotor-production-status.cjs").handle(request,{prisma:A.z,requireCashier:x.Xf,locationIdsForActor:y.eC,ApiError:v.hD,handleApiError:v.hS})}');
  body=body.replaceAll('/api/cashier/sales','/api/cashier/sales/status');
  new Script(body);
  return body;
}
module.exports={patchSalesRoute,makeTerminalRoute,makeStatusRoute};
