"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const {reportDate,recipients,formatReport}=require('./telegram-online-report.cjs');
test('previous completed local day handles UTC boundary and year boundary',()=>{
 assert.equal(reportDate(new Date('2026-11-04T20:30:00Z'),'Europe/Saratov'),'2026-11-04');
 assert.equal(reportDate(new Date('2026-01-01T05:00:00Z'),'Europe/Saratov'),'2025-12-31');
});
test('allowlist requires explicit valid recipients and removes duplicates',()=>{
 assert.throws(()=>recipients('[]'));
 assert.throws(()=>recipients('["@somebody"]'));
 assert.deepEqual(recipients('[123,"123",-100123]'),['123','-100123']);
});
test('money calculation preserves cents and negative daily net from old refunds',()=>{
 const text=formatReport({created_orders:0,paid_orders:1,paid_amount:'99001',refund_count:2,refund_amount:'110002',payment_time_fallbacks:0,refund_time_fallbacks:0},'2026-11-04','Europe/Saratov');
 assert.match(text,/Сумма оплат: 990,01 ₽/);
 assert.match(text,/Оплаты минус возвраты: −110,01 ₽/);
 assert.match(text,/включая заказы прошлых дней/);
});
