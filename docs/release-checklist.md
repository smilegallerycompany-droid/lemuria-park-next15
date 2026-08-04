# Release checklist — production hardening

## Env

- [ ] `DATABASE_URL` points to production Postgres
- [ ] Strong `AUTH_SECRET` (≥32, ≠ defaults / ChangeMe)
- [ ] Strong `QR_SIGNING_SECRET` (≥32, ≠ defaults)
- [ ] `NEXT_PUBLIC_APP_URL` is real HTTPS origin
- [ ] YooKassa set **or** consciously empty
- [ ] Email / Postbox set **or** consciously unset
- [ ] Optional `ERROR_MONITORING_DSN` only when provider ready

## Migrations

- [ ] `npx prisma migrate deploy` on target DB
- [ ] `npx prisma migrate status` → up to date
- [ ] Seed **not** run (`NODE_ENV=production` must refuse)

## Seed (dev/staging only)

- [ ] Demo password `ChangeMe123!` never in production
- [ ] Staging seed shows 7+ days, mixed order statuses, staff

## Login / roles

- [ ] Owner/director login
- [ ] Cashier login
- [ ] Disabled user cannot login
- [ ] Cashier cannot open director APIs
- [ ] Unauthenticated director API → 401

## Public booking

- [ ] Date / session / tickets
- [ ] Reservation hold
- [ ] Order create
- [ ] Honest `AWAITING_PAYMENT` without YooKassa keys
- [ ] Success + QR after real payment (staging with keys)

## Cashier

- [ ] Cash sale → PAID + tickets + seats ↓
- [ ] Card terminal sale
- [ ] Order visible to director

## QR

- [ ] Valid → SUCCESS
- [ ] Repeat → ALREADY_USED
- [ ] Wrong day / location / cancelled / refunded / unknown rejected
- [ ] USB wedge + camera paths

## Director

- [ ] Locations create/edit
- [ ] Schedule generate
- [ ] Close day / session
- [ ] Extra session + capacity
- [ ] Pricing future `validFrom`
- [ ] Staff create/disable
- [ ] Analytics
- [ ] Audit log (no secrets)

## Pricing / schedule / analytics / audit

- [ ] Old orders keep snapshot prices
- [ ] Paid session cannot be deleted
- [ ] Analytics PAID-only; cash/card/online split sane
- [ ] Audit sanitized

## Policy / offer / email / payment / webhook

- [ ] `/policy` `/offer` reachable
- [ ] Email failure does not undo PAID
- [ ] Webhook signature/validation path tested
- [ ] Double webhook safe

## UX / devices

- [ ] Public 390 / 430 / 768 / 1440 — no horizontal overflow
- [ ] Cashier 1024 / 1366 / iPad
- [ ] Director 1280 / 1440 / 1024 tablet
- [ ] Modals, empty, loading, long names, 0 and 15 seats

## Browser

- [ ] Chromium / Safari / Firefox smoke on public + cashier

## Backup / rollback

- [ ] Pre-deploy DB snapshot
- [ ] Restore drill documented
- [ ] Rollback = previous image + optional DB restore

## Pre-release commands (local)

- [ ] `npx prisma format && npx prisma validate && npx prisma generate`
- [ ] `npm run lint && npm run typecheck && npm test`
- [ ] `npm run build && npm run test:e2e`
