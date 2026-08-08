# Audit — analytics / scanner / internal UI

Branch base: `release/lemuria-production-hardening` @ `25a8548`

## Already calculated (pre-stage)

- Gross / refunds / net (PAID-only)
- Online vs cashier source split
- Cash / terminal card / site (`CARD_ONLINE`) payment split
- Orders, tickets, AOV, occupancy, check-ins, cancellations, refunds
- Daily series (legacy dashboard)

## Existing analytics API

- `GET /api/director/analytics` (expanded this stage to full report)

## Chart library

- None previously → added **Recharts** only

## Cashier profile (before)

- Thin page: name/email/role + logout

## QR (before)

- Always-on camera attempt via `BarcodeDetector`
- Manual + USB input
- No torch/switch/fullscreen result states / ZXing fallback

## UI duplication / inconsistency

- Director English nav vs Russian cashier labels
- Separate visual languages for shells
- KPI/table patterns copied per page

## Reuse plan

- Keep payment/reservation/check-in domain services
- Expand analytics via `analytics-report` + formulas helpers
- Keep `/api/cashier/check-in`
- Unify tokens + shells without touching public CSS

## Fixes delivered in this stage

- Full director analytics report + filters + charts + tables + CSV
- Cashier profile/stats/password/sessions APIs
- Mobile scanner UX + BarcodeDetector/ZXing fallback + PWA manifest
- Shared internal tokens and nav consistency
