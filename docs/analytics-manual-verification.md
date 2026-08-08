# Analytics manual verification (RC2)

Generated: 2026-08-08T21:22:27.235Z  
Period: last_30 in `Europe/Moscow`  
From: `2026-07-11T00:00:00.000Z`  
To: `2026-08-09T23:59:59.999Z`

## Fixture coverage in DB

| Check | Value |
|---|---|
| Active locations | 2 |
| Active cashiers | 2 |
| Online PAID revenue | yes |
| Cashier PAID revenue | yes |
| CASH payments | yes |
| CARD_TERMINAL payments | yes |
| CARD_ONLINE / YooKassa | yes |
| Paid orders | 33 |
| Tickets sold | 34 |
| Check-ins | 16 |
| No-show | 10 |

## Metric reconciliation (independent Prisma vs analytics report)

| Metric | Formula | Expected | Actual | Status |
|---|---|---|---|---|
| Gross Revenue | Σ PAID Order.totalAmount | 34300.00 | 34300.00 | **PASS** |
| Refunded Amount | Σ COMPLETED Refund.amount | 0.00 | 0.00 | **PASS** |
| Net Revenue | max(0, Gross − Refunded) | 34300.00 | 34300.00 | **PASS** |
| Paid Orders | count PAID orders | 33 | 33 | **PASS** |
| Tickets Sold | count VALID|USED tickets on PAID | 34 | 34 | **PASS** |
| AOV | Net / Paid Orders | 1039.39 | 1039.39 | **PASS** |
| Average Ticket Price | Net / Tickets Sold | 1008.82 | 1008.82 | **PASS** |
| Occupancy | paid seats / capacity | 0.013519 | 0.013519 | **PASS** |
| Attendance | SUCCESS check-ins / tickets sold | 0.470588 | 0.470588 | **PASS** |
| No-show | past VALID without SUCCESS check-in | 10 | 10 | **PASS** |
| Online Share | online revenue / Net | 0.026239 | 0.026239 | **PASS** |
| Cashier Share | cashier revenue / Net | 0.973761 | 0.973761 | **PASS** |
| Reservation Conversion | PAID with reservationId / reservations created | 0.000000 | 0.000000 | **PASS** |

## Summary

- Checks: 13
- PASS: 13
- FAIL: 0
- Overall: **PASS**

Money amounts shown in rubles for readability; API stores kopecks.
