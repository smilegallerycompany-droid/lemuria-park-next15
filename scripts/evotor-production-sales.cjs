"use strict";

function parseSale(raw, parse, ApiError) {
  const {cashReceived, ...rest} = raw ?? {};
  const sale = parse(rest); // Preserve every deployed validation/refinement.
  if (cashReceived !== undefined && (!Number.isInteger(cashReceived) || cashReceived < 0 || cashReceived > 2147483647)) {
    throw new ApiError("VALIDATION_ERROR", "Некорректная полученная сумма", 400);
  }
  return {...sale, ...(cashReceived !== undefined ? {cashReceived} : {})};
}

async function createPending(tx, input, priced, legacyCreate, domain = require("/app/evotor-payment-domain.cjs"), ApiError = domain.ApiError) {
  const {terminalForLocation, prepareQuotedEvotorReceipt} = domain;
  if (!["CASH","CARD_TERMINAL"].includes(input.paymentMethod)) {
    throw new ApiError("VALIDATION_ERROR", "Оплату должен подтвердить Эвотор", 400);
  }
  if (!input.idempotencyKey) throw new ApiError("VALIDATION_ERROR", "Требуется идентификатор операции",400);
  const cash=input.paymentMethod === "CASH";
  if (cash && (!Number.isInteger(priced.cashReceived) || priced.cashReceived < input.totalAmount || priced.cashReceived > 2147483647)) {
    throw new ApiError("VALIDATION_ERROR", "Укажите полученную сумму не меньше суммы заказа",400);
  }
  let terminal, receiptPayload;
  try {
    terminal=terminalForLocation(input.locationId);
    receiptPayload=prepareQuotedEvotorReceipt(priced.quote,priced.ticketTypes);
  } catch (error) {
    if (error instanceof domain.ApiError) {
      throw new ApiError(error.code,error.message,error.status,error.details);
    }
    throw error;
  }
  if (!terminal) throw new ApiError("NOT_CONFIGURED", "Для локации не настроен Эвотор",503);
  if (receiptPayload.totalAmount !== input.totalAmount) throw new ApiError("CONFLICT", "Сумма заказа изменилась",409);
  // Reuse the exact deployed mapping of OrderItem/OrderExtra/customer fields.
  // Only intercept the single atomic create; no temporary paid order is written.
  let called=false;
  const facade={order:{create(args){
    if (called) throw new Error("Unexpected repeated create");
    called=true;
    const data=args.data;
    if (data.source !== "CASHIER" || data.status !== "PAID" || !data.payments?.create || Array.isArray(data.payments.create)) {
      throw new Error("Unknown deployed order mapping");
    }
    return tx.order.create({...args,data:{...data,status:"AWAITING_PAYMENT",paidAt:null,paymentExpiresAt:null,
      payments:{create:{...data.payments.create,status:"PENDING",succeededAt:null}},
      evotorCheckout:{create:{terminalId:terminal.id,receiptPayload,
        cashReceived:cash ? priced.cashReceived : null,
        changeAmount:cash ? priced.cashReceived-input.totalAmount : null}},
    }});
  }}};
  const order=await legacyCreate(facade,input);
  if (!called || order.status !== "AWAITING_PAYMENT") throw new Error("Pending sale was not created");
  return order;
}

module.exports={parseSale,createPending};
