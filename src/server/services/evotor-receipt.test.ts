import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareEvotorReceipt, prepareQuotedEvotorReceipt, readEvotorReceipt } from "./evotor-receipt";

const adult = {code:"ADULT",quantity:1,unitPriceAmount:90000,subtotalAmount:90000};
const feed = {code:"FEED",quantity:2,unitPriceAmount:30000,subtotalAmount:60000};
const photo = {code:"PHOTO",quantity:1,unitPriceAmount:50000,subtotalAmount:50000};

test("production quote keeps a two-session bundle as one priced line and adds goods", () => {
  const quote = {totalAmount:230000,items:[{ticketTypeCode:"BUNDLE",secondarySessionId:"park-2",
    quantity:2,unitPriceAmount:60000,subtotalAmount:120000}],extras:[feed,photo]};
  const before = JSON.stringify(quote);
  const snapshot = prepareQuotedEvotorReceipt(quote,[{code:"BUNDLE"}]);
  assert.equal(snapshot.items[0].code,"BUNDLE");
  assert.equal(snapshot.items[0].quantity,2);
  assert.equal(snapshot.items[0].amount,120000);
  assert.equal(snapshot.totalAmount,230000);
  assert.equal(JSON.stringify(quote),before);
  assert.throws(()=>prepareQuotedEvotorReceipt(quote,[]));
  assert.throws(()=>prepareQuotedEvotorReceipt(quote,[{code:"BUNDLE"},{code:"BUNDLE"}]));
});

test("ticket, feed and photo retain separate fiscal lines and exact total", () => {
  const snapshot = prepareEvotorReceipt({totalAmount:200000,items:[adult],extras:[feed,photo]});
  assert.deepEqual(snapshot.items, [
    {code:"ADULT",quantity:1,amount:90000},
    {code:"FEED",quantity:2,amount:60000},
    {code:"PHOTO",quantity:1,amount:50000},
  ]);
});

test("standalone extras can be encoded without inventing ticket lines", () => {
  const snapshot = prepareEvotorReceipt({totalAmount:110000,items:[],extras:[feed,photo]});
  assert.equal(snapshot.items.length,2);
  assert.equal(snapshot.items.some(item=>item.code==="ADULT"),false);
});

test("snapshot detaches from later quote/catalog mutations and survives JSON storage", () => {
  const item = {...adult};
  const snapshot = prepareEvotorReceipt({totalAmount:90000,items:[item]});
  item.code="OTHER"; item.quantity=2; item.unitPriceAmount=100;
  assert.deepEqual(readEvotorReceipt(JSON.parse(JSON.stringify(snapshot)),90000).items,
    [{code:"ADULT",quantity:1,amount:90000}]);
});

test("rejects missing snapshots, unsupported versions, bad totals and incompatible quantities", () => {
  const snapshot = prepareEvotorReceipt({totalAmount:90000,items:[adult]});
  for (const bad of [null, {}, {...snapshot,version:2}, {...snapshot,totalAmount:1},
    {...snapshot,items:[{code:"ADULT",quantity:7,amount:90000}]},
    {...snapshot,items:[{code:"ADULT",quantity:0,amount:90000}]},
    {...snapshot,items:[{code:"",quantity:1,amount:90000}]}]) {
    assert.throws(()=>readEvotorReceipt(bad,90000));
  }
  assert.throws(()=>readEvotorReceipt(snapshot,80000));
  assert.throws(()=>prepareEvotorReceipt({totalAmount:90000,items:[{...adult,unitPriceAmount:80000}]}));
  assert.throws(()=>prepareEvotorReceipt({totalAmount:90000,items:[adult],extras:[feed]}));
});

test("refuses overflow and empty or wholly free checkouts", () => {
  assert.throws(()=>prepareEvotorReceipt({totalAmount:2147483648,items:[{
    code:"ADULT",quantity:1,unitPriceAmount:2147483648,subtotalAmount:2147483648}]}));
  assert.throws(()=>prepareEvotorReceipt({totalAmount:0,items:[]}));
  assert.throws(()=>prepareEvotorReceipt({totalAmount:0,items:[{...adult,unitPriceAmount:0,subtotalAmount:0}]}));
});
