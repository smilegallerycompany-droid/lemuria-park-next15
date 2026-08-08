# RC2 QA — UI / analytics / QR

Branch: `release/lemuria-ui-analytics-rc2`  
Base: `feature/analytics-mobile-scanner-ui` @ `e4a6f0d`

## Verdict

**CONDITIONAL PASS**

Physical iPhone Safari / Android Chrome camera tests were **not** executed in this environment.

QR physical device status: **PHYSICAL_DEVICE_TEST_REQUIRED**

## Visual / responsive

Checked via Playwright screenshots across desktop / tablet / mobile viewports.

Fixes applied:

- `overflow-x: clip` + `min-width: 0` on director/cashier mains
- Ellipsis for long table cells / brand
- Chart containers cannot blow horizontal layout
- Safe-area padding for cashier shell / scan live
- KPI grid collapses 2→1 columns on small phones
- ConfirmDialog focus trap + Escape
- Dynamic import for Recharts analytics page and QR scanner (+ ZXing already lazy)
- Schedule E2E hardened against fixture-only empty locations

## Analytics reconciliation

See `docs/analytics-manual-verification.md` — **13/13 PASS** on last_30 against independent Prisma aggregates.

Bug fixed: Attendance used past-session tickets as denominator; now uses VALID|USED tickets sold in period (matches documented formula). Removed unused past-session ticket count query.

Fixture notes (dev DB):

- 2+ locations
- cash / card terminal / yookassa present
- online + cashier PAID
- cancelled + refunded rows present
- check-ins + no-show present

## QR device matrix

| Scenario | Status |
|---|---|
| iPhone Safari permission / rear / torch / orientation / background | PHYSICAL_DEVICE_TEST_REQUIRED |
| Android Chrome same | PHYSICAL_DEVICE_TEST_REQUIRED |
| Manual VALID / ALREADY_USED (Playwright) | PASS |
| Duplicate guard | PASS |
| Offline blocks VALID | implemented |
| Tab hidden / pagehide stops tracks | hardened in RC2 |
| Permission denied / no camera / busy messages | hardened in RC2 |
| Insecure HTTP | manual fallback message |

## RBAC / profile

- Cashier cannot call `/api/director/*` (E2E)
- Profile ignores `?userId=` spoof (E2E)
- Wrong password rejected (E2E)
- Disabled login blocked (E2E)

## Performance / bundle

After `next build`:

| Route | First Load JS (page) | Heavy deps |
|---|---|---|
| `/director/analytics` | ~106 kB shared + 471 B page | Recharts async chunk ~421 kB |
| `/cashier/scan` | ~106 kB shared + 388 B page | ZXing async chunk ~468 kB |

- Recharts only loaded on `/director/analytics` via `next/dynamic`
- `@zxing/browser` only loaded on scan fallback path via dynamic `import()`
- Analytics report still bounded (`take: 20000` orders / `500` sessions); one fewer aggregate query after attendance fix

## Accessibility

- Dialog focus trap + restore focus + Escape
- Scanner controls keep aria-labels
- `prefers-reduced-motion` respected for skeletons/transitions
- Remaining: no full axe audit run in CI for this RC

## Screenshots

Local path (gitignored): `docs/qa-screenshots-rc2/`

Includes: director dashboard/analytics (desktop/tablet/mobile), revenue graph, heatmap, cashier shells, profile, QR idle/scanning/VALID/ALREADY_USED/WRONG_DATE.

## Remaining blockers

1. Physical device QR PASS required before calling scanner production-ready.
2. Staging HTTPS URL must be used for camera on real phones.
3. Live staging acceptance still separate from this RC branch.
