"use strict";

const diagnostic = require("./evotor-connectivity.cjs");

// Production reports group by paidAt/succeededAt, unlike the historical source
// schema. Keep timestamps in the same transaction as fiscal proof and revenue.
function withPaymentDates(prisma, clock = () => new Date()) {
  return {$transaction(fn, options) {
    return prisma.$transaction(tx => {
      const decorate = (model, status, column) => new Proxy(model, {get(target,key) {
        if (key === "update") return args => target.update({ ...args,
          data: {...args.data, ...(args.data.status === status ? {[column]:clock()} : {})} });
        const value=Reflect.get(target,key);
        return typeof value === "function" ? value.bind(target) : value;
      }});
      const wrapped=new Proxy(tx,{get(target,key) {
        if(key === "order") return decorate(target.order,"PAID","paidAt");
        if(key === "payment") return decorate(target.payment,"SUCCEEDED","succeededAt");
        const value=Reflect.get(target,key);
        return typeof value === "function" ? value.bind(target) : value;
      }});
      return fn(wrapped);
    },options);
  }};
}

async function handle(request, context, domain = require("/app/evotor-payment-domain.cjs")) {
  const reply=(status,body)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
  if (process.env.APP_ENV === "staging" &&
      (request.method === "GET" || request.headers.get("authorization") === "Bearer " + diagnostic.checkLabel)) {
    return diagnostic.handle(request);
  }
  if (request.method === "GET") return reply(404, {ok:false,error:{code:"NOT_FOUND"}});
  try {
    const terminal=domain.authenticateTerminal(request);
    const reader=request.body?.getReader();
    if(!reader) throw new domain.ApiError("VALIDATION_ERROR","Пустой запрос",400);
    const chunks=[];let size=0;
    try {
      while(true){
        const {done,value}=await reader.read();if(done)break;
        size+=value.byteLength;
        if(size>16384){await reader.cancel();throw new domain.ApiError("VALIDATION_ERROR","Запрос слишком большой",413);}
        chunks.push(value);
      }
    } finally {reader.releaseLock();}
    let body;
    try {body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}
    catch {throw new domain.ApiError("VALIDATION_ERROR","Некорректный JSON",400);}
    const handler=domain.createTerminalHandler({...context,prisma:withPaymentDates(context.prisma)});
    return reply(200,{ok:true,data:await handler(terminal,body)});
  } catch(error) {
    if(error instanceof domain.ApiError) return reply(error.status,{ok:false,error:{code:error.code,message:error.message}});
    if(error?.name === "ZodError") return reply(400,{ok:false,error:{code:"VALIDATION_ERROR",message:"Некорректные данные запроса"}});
    // Use the production error handler for its domain/prisma exception types.
    return context.handleApiError(error);
  }
}
module.exports={handle,withPaymentDates};
