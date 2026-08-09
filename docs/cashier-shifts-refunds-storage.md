# Cashier shifts, refunds, printing & storage

## Models

| Model | Purpose |
|-------|---------|
| `CashierShift` | OPEN / CLOSED / FORCE_CLOSED shift with cash totals |
| `CashOperation` | OPENING, SALE, REFUND, IN, OUT, CLOSING, ADJUSTMENT |
| `Order.shiftId` | Links cashier sales to the open shift |
| `Refund` | Extended: `publicId`, `paymentId`, `providerRefundId`, `completedAt`, statuses `SUCCEEDED/FAILED/CANCELLED` (+ legacy `COMPLETED`) |
| `PrintLog` | Extended: `ticketId`, `source` |

Migration: `20260810010000_cashier_shifts_refunds_storage`

## Shift lifecycle

1. Cashier opens shift (`POST /api/cashier/shift`) — one OPEN per cashier.
2. All cashier sales require OPEN shift; order gets `shiftId`.
3. Cash IN/OUT via `POST /api/cashier/shift/cash`.
4. Close (`PATCH /api/cashier/shift`) computes:
   `expected = opening + cashSales - cashRefunds + IN - OUT`
   `difference = actual - expected`

Director force-close: `POST /api/director/shifts` with `force` reason → `FORCE_CLOSED`.

## Refunds

**FULL only** (partial deferred).

- Cash / terminal: local `SUCCEEDED` under DIRECTOR/ADMIN/OWNER.
- CARD_ONLINE: YooKassa refund API; order becomes `REFUNDED` only on provider `succeeded`.
- Without credentials: `PAYMENT_NOT_CONFIGURED` — order not marked refunded.
- Cashier cannot refund by default.

## Print

Browser print at `/cashier/orders/[number]/print`.  
`POST .../print` → `PrintLog` + AuditLog (not a financial event).

## Storage

`YandexObjectStorage` — S3 SigV4 PUT/DELETE when:

- `YANDEX_STORAGE_ENDPOINT`
- `YANDEX_STORAGE_BUCKET`
- `YANDEX_STORAGE_ACCESS_KEY`
- `YANDEX_STORAGE_SECRET_KEY`
- `YANDEX_STORAGE_PUBLIC_BASE_URL` (or legacy `YANDEX_STORAGE_PUBLIC_URL`)

Allowed MIME: JPEG/PNG/WEBP. SVG blocked. Hard delete only when no gallery refs remain.

## UI

- Cashier: open-shift gate + shift bar + close summary
- Director: `/director/shifts`, detail report, dashboard «Смены сегодня»
- Admin: `/admin/shifts`
