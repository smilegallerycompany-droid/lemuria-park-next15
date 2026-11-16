"use strict";

const NOTE = "Продажа без билета";
const PRODUCTS = { FEED_SALE: "FEED", PHOTO_SALE: "PHOTO" };

function parseEntry(body, parse) {
  if (body?.note !== NOTE || !Object.hasOwn(PRODUCTS, body.kind)) return parse(body);
  // Use the existing manual-sale schema for the common entry fields. The
  // real product is restored before checking price or writing any records.
  return { ...parse({ ...body, kind: "BALABAS_SALE" }), kind: body.kind };
}

async function checkPrice(tx, entry, DomainError) {
  if (entry.note !== NOTE) return;
  const code = Object.hasOwn(PRODUCTS, entry.kind) ? PRODUCTS[entry.kind] : null;
  if (!code || !Number.isSafeInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 100) {
    throw new DomainError("INVALID_TICKET_TYPE", "Выберите корм или фото и укажите количество от 1 до 100.");
  }
  const product = await tx.cashierExtra.findFirst({
    where: { code, isActive: true },
    select: { unitPriceAmount: true },
  });
  if (!product || product.unitPriceAmount <= 0) {
    throw new DomainError("INVALID_TICKET_TYPE", "Эта позиция больше не продаётся.");
  }
  if (entry.amountKopecks !== product.unitPriceAmount * entry.quantity) {
    throw new DomainError("PRICE_NOT_CONFIGURED", "Цена изменилась. Обновите кассу перед оформлением продажи.");
  }
}

function isCashSale(entry) {
  return entry.note === NOTE && Object.hasOwn(PRODUCTS, entry.kind);
}

module.exports = { NOTE, parseEntry, checkPrice, isCashSale };
