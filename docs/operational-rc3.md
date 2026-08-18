# Operational RC3 — cashier shift UX

Branch: `release/lemuria-operational-rc3`

## Cashier UI

- Compact shift strip on all cashier pages (except login).
- `/cashier` — open form if no shift; otherwise sessions + sell + last orders + QR/IN/OUT/Смена.
- `/cashier/shift` — cash journal, IN/OUT, close.
- `/cashier/shift/close` — ledger close with live difference + ConfirmDialog.
- `/cashier/shift/report` — closed shift report + browser print.
- `/cashier/profile` — close-shift shortcut.

## Cash balance

Server-calculated only:

`opening + cash sales + IN − cash refunds − OUT + audited adjustments`

OUT above current balance → `INSUFFICIENT_CASH_BALANCE` (409) for CASHIER/DIRECTOR.
ADMIN/OWNER may override (AuditLog `adminOverride: true`). No client-trusted balance.

Cash journal is a table (time / type / amount / comment / order / staff) with typed row colors.

## Director

- `/director/shifts` — period/location/cashier/status/difference filters + KPIs.
- Detail: force-close with required reason → `FORCE_CLOSED` + AuditLog.
- Dashboard alerts when closed shift `cashDifference != 0`.
- Print CSS hides nav/sidebar/buttons.

## Integrations (honest)

- Partial refund: still deferred.
- PDF: not generated — browser print only.
- Physical QR / live YooKassa / Postbox / Yandex Storage: see final RC report (`NOT_CONFIGURED` or `PHYSICAL_DEVICE_TEST_REQUIRED` unless credentials/devices present).
