# Security audit result

Scope: production hardening for Lemuria Park Next 15 (minimal invasive).

## Controls added

| Control | Location | Notes |
|---------|----------|-------|
| Security headers | `src/middleware.ts` | CSP (basic), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` |
| Staff noindex | `src/middleware.ts` + `public/robots.txt` | `/cashier`, `/director`, `/admin`, `/staff`; robots also Disallow `/api/` |
| Login rate limit | `/api/auth/login`, `/api/cashier/login` | In-memory Map keyed by `IP+email`, 10 / 15 min |
| Public rate limit | reservations, orders, check-in | In-memory per IP (and cashier id for check-in) |
| Weak secrets refused in production | `src/lib/config/env.ts` | Rejects default/dev `AUTH_SECRET` / `QR_SIGNING_SECRET` when `NODE_ENV=production` and app URL is not localhost |
| Seed production guard | `prisma/seed.ts` | Refuses `NODE_ENV=production`; documents `ChangeMe123!` as demo-only |
| YooKassa webhook | `applyYooKassaWebhook` | Rejects when provider not configured; rejects payload without `object.id` |
| Audit sanitization | `src/lib/audit.ts` `sanitizeAuditJson` | Never stores password/secret/token fields in metadata |
| Error reporting | `src/server/monitoring/error-reporter.ts` | Console reporter; optional `ERROR_MONITORING_DSN` (no Sentry SDK required); redacts secrets/PII/QR |

## Residual risks / follow-ups

- In-memory rate limits are per-process (add ALB/WAF limits for multi-instance).
- CSP uses `'unsafe-inline'` / `'unsafe-eval'` for Next.js compatibility — tighten when nonce-based CSP is feasible.
- Staff and cashier share the same session cookie name — intentional for this codebase; do not expose staff cookies to third-party origins.
- Demo seed password must never be used in production (guarded).

## Verified

- Unauthenticated director APIs → 401
- Cashier cannot access director APIs → 403/401
- Disabled user cannot login → 401
- Webhook without YooKassa credentials → rejected
- Audit helper redacts `password` / `passwordHash` / `qrToken` keys
