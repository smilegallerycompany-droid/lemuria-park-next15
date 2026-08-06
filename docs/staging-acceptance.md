# Staging acceptance — Lemuria Park RC1

| Field | Value |
|-------|--------|
| Release branch | `release/lemuria-staging-rc1` (from `release/lemuria-production-hardening`) |
| Base SHA (hardening) | `25a854898bdd420ca6a5c58431e36f6e9b3ea4eb` |
| Staging RC HEAD | `61070ed7d9aa54d32c758e4c013cfd3c3d862741` |
| Tag | `rc-1` (hardening freeze on `25a8548`); image tag `lemuria-park:rc1` |
| Target staging URL | `https://stage.lemuriapark.ru` (planned) |
| Decision date | 2026-08-06 |

## Decision: **CONDITIONAL PASS**

Production merge to `main` is **not** authorized until remote staging is provisioned and the blockers below are cleared.  
Local code + automated suites for staging ops are green; live staging deploy was **not** available in this environment.

---

## Gate matrix

| # | Gate | Status | Evidence | Blocker / next step |
|---|------|--------|----------|---------------------|
| 1 | Branch / HEAD clean for hardening | PASS | `25a8548` tagged `rc-1` | Staging RC commits on `release/lemuria-staging-rc1` |
| 2 | Prisma format/validate/generate | PASS | Local commands | — |
| 3 | Lint / typecheck | PASS | Local commands | — |
| 4 | Unit / integration | PASS | `npm test` | — |
| 5 | Playwright E2E | PASS | Includes `e2e/staging-ops.spec.ts` | — |
| 6 | Production build | PASS | `npm run build` | — |
| 7 | Migration on clean DB | PASS | Prior `docs/migration-audit.md` | Re-run on staging Managed PG |
| 8 | Secrets / env validation | PASS (code) | `src/lib/config/env.ts` rejects weak secrets + localhost HTTPS | Provide Lockbox values |
| 9 | Dockerfile / `.dockerignore` | PASS | Multi-stage, non-root, HEALTHCHECK, no `.env` | Build+push to YCR |
| 10 | Health live | PASS (local) | `GET /api/health/live` | Verify on stage URL |
| 11 | Health ready | PASS (local) | `GET /api/health/ready` + DB | Verify on stage URL |
| 12 | Cron cleanup auth | PASS (local) | 401 without secret; route + unit test | Wire Cloud Scheduler |
| 13 | Staging bootstrap script | PASS (code) | `scripts/staging-bootstrap.ts` | Run against staging DB with env passwords |
| 14 | Site-wide staging noindex | PASS (code) | `DEPLOY_ENV=staging` → `X-Robots-Tag` | Confirm headers on stage |
| 15 | Public booking (to AWAITING_PAYMENT) | PASS (local e2e) | `public-booking.spec.ts` | Full paid path needs ЮKassa staging |
| 16 | Cashier cash + seats | PASS (local e2e) | `cashier-sale.spec.ts` | Re-run on stage |
| 17 | QR SUCCESS / ALREADY_USED | PASS (local e2e) | `qr-checkin.spec.ts` | Re-run on stage |
| 18 | Director price snapshot / paid session guard | PASS (local e2e) | director specs | Re-run on stage |
| 19 | RBAC | PASS (local e2e) | `rbac.spec.ts` | Staging users ≠ ChangeMe |
| 20 | Payment smoke (provider) | **FAIL / BLOCKED** | No staging ЮKassa credentials in this workspace | Configure shop + webhook |
| 21 | Webhook live | **FAIL / BLOCKED** | No public HTTPS staging endpoint | Deploy + register webhook |
| 22 | Email smoke | **CONDITIONAL** | `EMAIL_PROVIDER=none` → honest NOT_CONFIGURED | Accept success-screen tickets temporarily or configure Postbox |
| 23 | Backup / restore | **CONDITIONAL** | Procedure in runbook; restore drill not run on Managed PG here | Snapshot staging DB; restore to throwaway |
| 24 | Monitoring DSN | **CONDITIONAL** | ConsoleErrorReporter active | Set `ERROR_MONITORING_DSN` when ready |
| 25 | HTTPS staging domain | **FAIL / BLOCKED** | Domain not provisioned here | ALB + Certificate Manager |
| 26 | Merge to main | **HOLD** | — | Only after decision → PASS |

---

## Required for production release (must be PASS)

- migrations, auth, RBAC, public booking, cashier, QR, director  
- payment + webhook  
- backup  
- HTTPS  
- secrets  

Email may remain CONDITIONAL PASS only if product explicitly accepts success-screen delivery without promising email.

---

## Manual acceptance checklist (on live staging)

### Public
- [ ] Home loads (noindex header present)
- [ ] Date → session → tickets → reservation → checkout → order
- [ ] With ЮKassa: redirect → webhook → PAID → tickets → QR
- [ ] Without ЮKassa: honest `AWAITING_PAYMENT` (no fake PAID)

### Cashier
- [ ] Login (staging user)
- [ ] Cash sale + card sale
- [ ] Online order visible
- [ ] Browser print
- [ ] QR SUCCESS then ALREADY_USED

### Director
- [ ] Analytics (PAID only)
- [ ] Future price does not rewrite old OrderItem
- [ ] Close empty session OK; paid session refused
- [ ] Create / disable cashier
- [ ] Audit log (no secrets)

### Mobile / tablet
- [ ] 390×844 public purchase (no horizontal overflow)
- [ ] 1024×768 cashier sell + QR

---

## Production deploy plan (after PASS)

1. Snapshot production Postgres.  
2. `prisma migrate deploy` on production.  
3. Deploy image (previous `:rc1` promoted or new prod tag).  
4. Verify `/api/health/live` + `/api/health/ready`.  
5. Smoke director + cashier + one paid online order.  
6. Confirm webhook + cron scheduler.  
7. **Never** run seed / staging-bootstrap on production.

## Rollback plan

1. Redeploy previous image tag.  
2. If migration unsafe: restore DB from pre-deploy snapshot, then previous image.  
3. Re-point webhook if URL revision-specific.  
4. Do not re-bootstrap or seed.

---

## Sign-off

| Role | Name | Result | Date |
|------|------|--------|------|
| Engineering | — | CONDITIONAL PASS | 2026-08-06 |
| Product / ops | — | pending live staging | — |
