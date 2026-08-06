# Operations runbook — Lemuria Park

## Environments

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres (Yandex Managed PG recommended) |
| `DEPLOY_ENV` | `staging` \| `production` \| local — staging enables site-wide noindex |
| `NEXT_PUBLIC_APP_URL` | Public site URL (HTTPS in staging/production) |
| `AUTH_SECRET` | Staff session HMAC (≥32 chars; no defaults in staging/production) |
| `QR_SIGNING_SECRET` | QR / signing material (≥32 chars; no defaults) |
| `CRON_SECRET` | Bearer for `POST /api/cron/cleanup` (≥32 chars in staging/production) |
| `PAYMENT_PROVIDER` | `none` \| `yookassa` |
| `YUKASSA_SHOP_ID` / `YUKASSA_SECRET_KEY` | Online payments; empty → honest `AWAITING_PAYMENT` |
| `EMAIL_*` / Postbox | Yandex Postbox SMTP; unset → email not faked |
| `ERROR_MONITORING_DSN` | Optional; ConsoleErrorReporter until SDK wired |

## Deploy (Yandex Cloud / Docker)

1. Set strong secrets (never seed defaults / `ChangeMe123!`).
2. `npx prisma migrate deploy`
3. **Do not** run `prisma db seed` in production (`NODE_ENV=production` exits 1).
4. Build image with `DOCKER_BUILD=1` for standalone output.
5. Configure YooKassa webhook: `https://YOUR_DOMAIN/api/webhooks/yookassa`
6. Smoke: public booking, cashier login, director analytics, one check-in.

## Recommended deploy order

1. Backup production DB.
2. Apply migrations (`prisma migrate deploy`).
3. Deploy app revision.
4. Verify `/api/public/config` + director login.
5. Enable / verify YooKassa webhook.
6. Enable email if Postbox ready.

## Rollback

1. Redeploy previous container/image tag.
2. Do **not** re-run seed.
3. If a migration broke schema: restore Postgres from the pre-deploy backup, then redeploy previous app.
4. Re-check webhook URL still points at live revision.

## Daily PostgreSQL backup

- Prefer Yandex Managed PostgreSQL automated daily backups + PITR.
- Retention: ≥7 daily + ≥4 weekly.
- Store backup credentials outside the app container.

## Restore verification

Monthly:

```bash
# restore backup into a throwaway DB, then:
DATABASE_URL=postgresql://.../lemuria_restore_check npx prisma migrate status
# smoke: director login against restore DB (staging only)
```

Document restore RTO/RPO with the hosting team.

## Backup rotation

- Daily → keep 7–14 days.
- Weekly → keep 4–8 weeks.
- Before major releases → named snapshot `pre-release-YYYYMMDD`.

## Health checks

```bash
curl -fsS "$APP_URL/api/health/live"    # process up
curl -fsS "$APP_URL/api/health/ready"   # Postgres + required env (no ЮKassa probe)
```

Responses never include secrets, connection strings, or stack traces.  
Correlation: `X-Request-Id` on middleware responses and cron.

## Cron cleanup

```bash
curl -X POST "$APP_URL/api/cron/cleanup" \
  -H "Authorization: Bearer $CRON_SECRET"
```

- Expires stale reservations + `AWAITING_PAYMENT` orders (idempotent).
- Without / wrong secret → 401.
- On failure: ErrorReporter `CRON_CLEANUP_FAILED`; re-run manually; never delete PAID orders.
- Schedule every 5 minutes in Cloud Scheduler.

## Staging bootstrap (not seed)

```bash
# after migrate deploy on empty staging DB:
DEPLOY_ENV=staging npm run staging:bootstrap
```

Passwords only via `STAGING_*_PASSWORD` env. Never `ChangeMe123!`. Never commit.  
Rotate after first login. See `docs/staging-deploy.md`.

## Webhook health

1. YooKassa cabinet → delivery history for `/api/webhooks/yookassa`.
2. App logs: validation failures (no secrets).
3. Stuck `AWAITING_PAYMENT` after customer paid → reconcile by provider payment id (never mark PAID from browser).

## YooKassa unavailable

- Online checkout stays honest `AWAITING_PAYMENT` / fails create payment — do not fake PAID.
- Sell via cashier (cash / terminal) until online restored.
- After restore: confirm webhook + one test payment in staging.

## Email (Postbox) down

- Tickets remain issued; customer can show QR from success page / cashier reprint path if available.
- Queue/retry via ErrorReporter email failures; do not block PAID status on email.

## Session oversold / capacity conflict

1. Freeze sales for that session (director close).
2. Compare capacity vs PAID + AWAITING + active reservations.
3. Prefer compensating the latest conflicting sale (refund / move) — never negative capacity.
4. File audit note.

## Manual cancel

- Director order detail → cancel only when business rules allow (unpaid / policy).
- Never delete PAID financial rows.

## Manual refund

- Director order → refund with reason (≥3 chars).
- Partial refund only if model supports; re-check analytics net revenue after.

## Restore director access

1. DB: set owner/admin `status=ACTIVE`, reset password hash via controlled script (not seed).
2. Or second OWNER resets staff password in UI.
3. Rotate `AUTH_SECRET` only if cookie forgery suspected (forces all re-login).

## Disable cashier

Director → Staff → disable user. Confirm login returns 401. Sessions cookies expire naturally.

## Change active location

Director → Locations: activate target, deactivate others if single-venue mode. Verify public config slug/address.

## Emergency close day

1. Director → Schedule / Sessions: close remaining sessions for the date.
2. Stop cashier sales for closed sessions.
3. Communicate to floor staff; online booking will hide non-bookable slots.

## Incident: webhook flood / login brute force

- App-level rate limits mitigate single-node abuse.
- Tighten at ALB / Smart Web Security for multi-instance.
- Rotate `AUTH_SECRET` only with planned staff re-login.

## Secrets hygiene

- Never store passwords, payment secrets, full QR tokens, or full PII in audit metadata / browser logs.
- ErrorReporter redacts sensitive fields.
