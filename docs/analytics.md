# Director analytics

Route: `/director/analytics`  
API: `GET /api/director/analytics`

All money values are **kopecks** in API/calculations. Rubles are formatted only in UI.

Revenue source of truth: `Order.status = PAID` only.  
`Reservation` and `AWAITING_PAYMENT` are never counted as revenue.

## Filters (URL search params)

`locationId`, `preset`, `from`, `to`, `source`, `paymentMethod`, `ticketTypeId`, `cashierId`, `timezone`

Presets: `today`, `yesterday`, `last_7`, `last_30`, `this_month`, `prev_month`, `custom`.

Calendar boundaries use the selected location timezone (default `Europe/Moscow`).

## Formulas

| KPI | Formula |
|---|---|
| Gross Revenue | Σ `Order.totalAmount` where status=`PAID` |
| Refunded Amount | Σ `Refund.amount` where status=`COMPLETED` on those orders |
| Net Revenue | `max(0, Gross − Refunded)` |
| Paid Orders | count distinct PAID orders |
| Tickets Sold | count tickets with status in `VALID`,`USED` on PAID orders |
| Average Order Value | `Net / Paid Orders` (0 if no orders) |
| Average Ticket Price | `Net / Tickets Sold` (0 if no tickets) |
| Available Capacity | Σ session.capacity in period |
| Paid Occupancy | paid seats / Available Capacity |
| Attendance Rate | SUCCESS check-ins in period / VALID|USED tickets on PAID orders in period |
| No-show | VALID paid tickets for past sessions with no SUCCESS check-in |
| Online / Cashier revenue | PAID totals by `Order.source` |
| Cash / Card / YooKassa | SUCCEEDED payments by method (`CASH` / `CARD_TERMINAL` / `CARD_ONLINE`) |
| Reservation Conversion | PAID orders with `reservationId` / reservations created in period |

Payment split is **disjoint**:

- cash → `CASH`
- card → `CARD_TERMINAL`
- yookassa/site → `CARD_ONLINE`

Cashier button «Сайт» keeps `Order.source = CASHIER` and uses `CARD_ONLINE`.

## Comparison period

For any selected `[from, to]` the previous window is the immediately preceding interval of equal duration.

When previous baseline is `0` and current `> 0`, UI shows «Новый показатель» (no fake %).  
When both are `0`, UI shows «Нет данных для сравнения».

## Performance notes

- KPI core uses Prisma `aggregate` / `groupBy` / `count`.
- Series/tables use a bounded `findMany` (`take: 20000`) with narrow selects.
- Max period length: 100 days.
- Location access checked against staff `locationIds` when the list is non-empty.
