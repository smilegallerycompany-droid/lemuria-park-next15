# Physical QR acceptance — RC2 staging

**Verdict for physical devices: `CONDITIONAL PASS` / matrix below uses `NOT_TESTED` where a real handset was unavailable.**

Deployed app SHA at smoke time: see `docs/staging-acceptance-rc2.md`.  
HTTPS staging (Cloudflare quick tunnel; ephemeral): recorded in staging acceptance doc.

Fixtures: real `Ticket.qrToken` rows in the **staging** Postgres DB.  
PNG / token files (gitignored): `docs/qa-screenshots-rc2/staging-qr/`

Server-side check-in verification (no client mocks) against staging API:

| Fixture | Expected | API result |
|---|---|---|
| A VALID | SUCCESS | PASS |
| A repeat | ALREADY_USED | PASS |
| B USED | ALREADY_USED | PASS |
| C WRONG_DATE | WRONG_DATE | PASS |
| D WRONG_LOCATION | WRONG_LOCATION | PASS |
| E CANCELLED | CANCELLED | PASS |
| F REFUNDED | CANCELLED (server maps refunded → CANCELLED) | PASS |

## Matrix

| Scenario | iPhone Safari | Android Chrome | Notes |
|---|---|---|---|
| Permission | NOT_TESTED | NOT_TESTED | Requires physical device on HTTPS |
| Rear camera | NOT_TESTED | NOT_TESTED | |
| Recognition | NOT_TESTED | NOT_TESTED | PNG fixtures ready under `staging-qr/` |
| VALID | NOT_TESTED | NOT_TESTED | API SUCCESS verified on staging |
| ALREADY_USED | NOT_TESTED | NOT_TESTED | API verified |
| WRONG_DATE | NOT_TESTED | NOT_TESTED | API verified |
| WRONG_LOCATION | NOT_TESTED | NOT_TESTED | Cashier scoped to primary location |
| CANCELLED | NOT_TESTED | NOT_TESTED | API verified |
| REFUNDED | NOT_TESTED | NOT_TESTED | API returns CANCELLED (product mapping) |
| Manual input | NOT_TESTED | NOT_TESTED | Covered by Playwright on Chromium |
| Switch camera | NOT_TESTED | NOT_TESTED | |
| Torch | NOT_TESTED | NOT_TESTED | UNSUPPORTED allowed if capability missing |
| Background/foreground | NOT_TESTED | NOT_TESTED | Code stops tracks on hide/pagehide |
| Orientation | NOT_TESTED | NOT_TESTED | |
| Track cleanup | NOT_TESTED | NOT_TESTED | Hardened in RC2; needs device confirm |
| Network error | NOT_TESTED | NOT_TESTED | |
| Safe-area | NOT_TESTED | NOT_TESTED | |

## How to finish physical PASS

1. Open HTTPS staging URL on the phone (secure context required).
2. Login: `cashier@lemuriapark.ru` / staging seed password.
3. Open `/cashier/scan`, allow camera, scan PNGs from `staging-qr/` on another screen (or print).
4. Fill this matrix with PASS / FAIL / UNSUPPORTED.
5. Only then raise overall RC verdict to PASS.

**Do not mark iPhone/Android columns PASS without a real device run.**
