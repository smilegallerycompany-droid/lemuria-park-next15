# Яндекс Облако

Канон: [`docs/ECOSYSTEM.md`](./ECOSYSTEM.md) §6–7.  
Фактический инвентарь каталогов (2026-09-08): [`yandex-production-audit.md`](./yandex-production-audit.md), стоимость [`production-costs.md`](./production-costs.md), DNS snapshot [`dns-before-production.md`](./dns-before-production.md).

Стек только из РФ, без VPN: ЮKassa, Managed PostgreSQL, Serverless Containers, Object Storage, Postbox, Cloud DNS, Certificate Manager, Audit Trails, Monium.

## Каталоги

| Каталог | Назначение |
|---|---|
| `lemuria-production` | боевой контур |
| `lemuria-staging` | отдельные БД, bucket, secrets, image до PASS |

Не делить PostgreSQL между кассой и директором. Одна БД на контур.

## Сервисы

| Назначение | Сервис |
|---|---|
| PostgreSQL + PITR | Managed Service for PostgreSQL (`ru-central1`) |
| Файлы | Object Storage (S3) |
| Next.js | Serverless Containers + VPC к PG |
| Образы | Container Registry |
| HTTPS | Certificate Manager (Let’s Encrypt) |
| DNS | Cloud DNS |
| Письма | Postbox |
| Cron | timer-trigger → тот же контейнер / отдельный job-контейнер |
| Наблюдение | Monium |
| Аудит ресурсов | Audit Trails |
| Секреты | Lockbox → env |
| Оплата | ЮKassa, webhook `https://lemuriapark.ru/api/webhooks/yookassa` |

## Хосты

`lemuriapark.ru` · `cashier.lemuriapark.ru` · `admin.lemuriapark.ru` · `owner.lemuriapark.ru` · `stage.lemuriapark.ru`

Внутренние порталы: noindex.

## Деплой образа

```bash
docker build -t cr.yandex/<REGISTRY_ID>/lemuria-park:<git-sha> \
  --build-arg NEXT_PUBLIC_APP_URL=https://lemuriapark.ru \
  --build-arg DOCKER_BUILD=1 .
docker push cr.yandex/<REGISTRY_ID>/lemuria-park:<git-sha>
```

В контейнере: `npx prisma migrate deploy`.  
`prisma db seed` в production запрещён.

Staging PASS (тот же image tag) → production. Не собирать «чуть другой» прод-образ руками.

## Честность провайдеров

- нет `YUKASSA_*` → онлайн не становится PAID
- нет Postbox → UI не показывает «отправлено»
- нет Object Storage ключей → не притворяться, что медиа в облаке
