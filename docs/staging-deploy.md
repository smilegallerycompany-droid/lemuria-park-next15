# Staging deployment — Lemuria Park

Target URL (example): `https://stage.lemuriapark.ru`  
Image tag example: `cr.yandex/<REGISTRY>/lemuria-park:rc1`

## Principles

- Separate Postgres database (never production `DATABASE_URL`).
- Separate secrets (`AUTH_SECRET`, `QR_SIGNING_SECRET`, `CRON_SECRET`).
- `NODE_ENV=production` + `DEPLOY_ENV=staging`.
- `NEXT_PUBLIC_APP_URL=https://stage.lemuriapark.ru` (HTTPS, not localhost).
- **Do not** run `prisma db seed` on staging.
- Site-wide `noindex` when `DEPLOY_ENV=staging`.

## 1. Provision

1. Create Managed PostgreSQL database `lemuria_staging`.
2. Create Lockbox secrets for staging.
3. Reserve DNS + Certificate Manager for `stage.lemuriapark.ru`.
4. Create Container Registry repository.

## 2. Migrate (empty DB)

```bash
export DATABASE_URL="postgresql://…/lemuria_staging?sslmode=require"
npx prisma generate
npx prisma migrate deploy
# NEVER: npx prisma db seed
```

## 3. Bootstrap minimal data

Passwords via env only (never commit):

```bash
export DEPLOY_ENV=staging
export STAGING_OWNER_EMAIL="…"
export STAGING_OWNER_PASSWORD="…"   # ≥16 chars, not ChangeMe*
export STAGING_DIRECTOR_EMAIL="…"
export STAGING_DIRECTOR_PASSWORD="…"
export STAGING_CASHIER_EMAIL="…"
export STAGING_CASHIER_PASSWORD="…"
export STAGING_LOCATION_SLUG="krasnodar-stage"

npm run staging:bootstrap
```

Then login and rotate passwords via Director → Staff → «Сбросить пароль».  
First-login forced password change is **not** in schema yet — treat rotation as mandatory ops step.

## 4. Build & push image

```bash
export NEXT_PUBLIC_APP_URL=https://stage.lemuriapark.ru
DOCKER_BUILD=1 docker build \
  -t cr.yandex/<REGISTRY_ID>/lemuria-park:rc1 \
  --build-arg NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
  .
docker push cr.yandex/<REGISTRY_ID>/lemuria-park:rc1
```

`.dockerignore` excludes `.env`, tests, docs screenshots, git metadata.

## 5. Runtime env (container)

| Variable | Staging value |
|----------|----------------|
| `NODE_ENV` | `production` |
| `DEPLOY_ENV` | `staging` |
| `DATABASE_URL` | staging DB only |
| `NEXT_PUBLIC_APP_URL` | `https://stage.lemuriapark.ru` |
| `AUTH_SECRET` | ≥32, unique |
| `QR_SIGNING_SECRET` | ≥32, unique |
| `CRON_SECRET` | ≥32, unique |
| `PAYMENT_PROVIDER` | `yookassa` or `none` |
| `YUKASSA_*` | staging shop keys or empty |
| `EMAIL_PROVIDER` | `yandex_postbox` or `none` |
| `ERROR_MONITORING_DSN` | optional |

Unsafe config → process throws at startup (`src/lib/config/env.ts`).

## 6. Health

```bash
curl -fsS https://stage.lemuriapark.ru/api/health/live
curl -fsS https://stage.lemuriapark.ru/api/health/ready
```

## 7. Cron

```bash
curl -X POST https://stage.lemuriapark.ru/api/cron/cleanup \
  -H "Authorization: Bearer $CRON_SECRET"
```

Schedule every 5 minutes (Cloud Scheduler / cron). Without secret → 401.

## 8. YooKassa webhook

`https://stage.lemuriapark.ru/api/webhooks/yookassa`

## 9. Smoke after deploy

1. Health live + ready = 200  
2. Public config loads  
3. Director / cashier login with staging users  
4. Reservation → order → AWAITING_PAYMENT (or full payment if keys present)  
5. Cashier cash sale + QR SUCCESS / ALREADY_USED  

See `docs/staging-acceptance.md` for the release gate.
