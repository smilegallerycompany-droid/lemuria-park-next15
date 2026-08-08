# Staging acceptance — RC2

Branch: `release/lemuria-ui-analytics-rc2`  
Base code before staging hardening commits: `3d9d24a` (see git log for camera/health fixes).

## Staging URL

Ephemeral Cloudflare quick tunnel (local production `next start` + isolated Postgres):

`https://tagged-pete-desktop-elite.trycloudflare.com`

Local origin: `http://127.0.0.1:3001`  
DB: Docker `lemuria-staging-postgres` on `127.0.0.1:5433` / DB `lemuria_staging`  
Secrets: `.env.staging` (gitignored), strong random AUTH/QR secrets, **not** production.

> Tunnel URL is ephemeral — restart with `/tmp/cloudflared tunnel --url http://127.0.0.1:3001` if expired.
>
> Current tunnel (this session): `https://tagged-pete-desktop-elite.trycloudflare.com`

**Deployed runtime SHA** (from `/api/health/live`): `589f1880bf78fec0932378044deb7ec9e4aaeeb0`

## Health

| Check | Result |
|---|---|
| `GET /api/health/live` | PASS |
| `GET /api/health/ready` | PASS |
| Staging `robots.txt` Disallow:/ | PASS |
| `X-Robots-Tag: noindex` | PASS |
| `/cashier/scan` `Permissions-Policy: camera=(self)` | PASS |

## Smoke

| Area | Result |
|---|---|
| Public home / sessions | PASS |
| Public reservation | PASS |
| Public order → AWAITING_PAYMENT | PASS |
| Director login / dashboard / analytics / schedule / prices / orders | PASS |
| Cashier login / sessions / orders / profile / scan | PASS |
| Cashier CASH sale (API) | PASS |
| QR fixtures A–F via real check-in API (HTTP + HTTPS) | PASS |
| No unexpected 5xx / pageerror in smoke | PASS |

## Critical defect found & fixed

Middleware previously set `Permissions-Policy: camera=()` globally, which **blocks getUserMedia** for the QR scanner on real devices.  
Fixed: allow `camera=(self)` only on `/cashier/scan`; keep camera denied elsewhere. Added `media-src 'self' blob:` for preview.

Also added `/api/health/live` + `/api/health/ready` and staging-wide noindex.

## Physical QR

See `docs/physical-qr-acceptance.md` — **NOT_TESTED** on real iPhone/Android in this run → overall **CONDITIONAL PASS**.

## PR to main

**Not opened** — physical device PASS required for full PASS / merge recommendation.
