# Deployment

Canonical cloud map: [`yandex-cloud.md`](./yandex-cloud.md), [`ECOSYSTEM.md`](./ECOSYSTEM.md).  
Live inventory: [`yandex-production-audit.md`](./yandex-production-audit.md).  
Ops incidents: [`operations-runbook.md`](./operations-runbook.md).

## Images

```bash
SHA=$(git rev-parse --short HEAD)
REL="release-${SHA}-$(date -u +%Y%m%d%H%M%S)"
docker build --platform linux/amd64 \
  --build-arg GIT_SHA="$SHA" \
  --build-arg NEXT_PUBLIC_APP_URL=https://lemuriapark.ru \
  -t "cr.yandex/crprmg5vv1ubl0u4fpad/lemuria-app:$REL" .
docker push "cr.yandex/crprmg5vv1ubl0u4fpad/lemuria-app:$REL"
# pin the digest in Serverless Containers — never only :latest
```

Standalone output is enabled only when `DOCKER_BUILD=1` (Dockerfile). `.dockerignore` excludes `.env`, `.git`, `.yc-keys`, tests, seed.

## Staging vs production

| | Staging | Production |
|---|---|---|
| Container | `lemuria-app-staging` | `lemuria-app-production` |
| Gateway | `lemuria-staging-gw` | `lemuria-production-gw-temp` (no custom DNS yet) |
| Database | `lemuria_staging` | `lemuria` |
| `APP_ENV` | `staging` | `production` |
| `RUN_MIGRATE_ON_START` | `0` (migrate from a controlled job, not every scale-up) | **never 1** |
| Seed | staging seed only with explicit flags; never production | forbidden |

Promote **the same digest** after staging PASS. Do not rebuild a «slightly different» production image.

## Health

- `GET /api/health/live` — process up, includes `GIT_SHA`  
- `GET /api/health/ready` — database ping  

Direct `*.containers.yandexcloud.net` URLs must stay IAM 403.

## Migrations

```bash
npx prisma migrate status   # inspect
npx prisma migrate deploy   # apply existing SQL only
```

Never `migrate dev`, `migrate reset`, or `db push` on Yandex. Destructive SQL → STOP and written confirmation. Production deploy of migrations needs an explicit go-ahead (`разрешаю production migration` in ops practice).

## Rollback

Redeploy previous container revision/digest. Do not re-seed. Schema rollback = restore PostgreSQL backup, then old app revision.
