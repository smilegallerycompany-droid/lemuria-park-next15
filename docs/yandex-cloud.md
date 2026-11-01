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
| Оплата | ЮKassa, webhook `https://парклемурия.рф/api/webhooks/yookassa` (ASCII: `https://xn--80akjgfhqje3a8k.xn--p1ai/api/webhooks/yookassa`) |

## Хосты

Канон: [`idn-domain.md`](./idn-domain.md).

`парклемурия.рф` · `www.парклемурия.рф` (redirect) · `cashier.парклемурия.рф` · `admin.парклемурия.рф` · `stage.парклемурия.рф`  
`owner.парклемурия.рф` — не публиковать, пока Owner UI не готов.

Внутренние порталы: noindex.

## Деплой образа

```bash
docker build -t cr.yandex/<REGISTRY_ID>/lemuria-park:<git-sha> \
  --build-arg NEXT_PUBLIC_APP_URL=https://xn--80ajjjbhwgdz8k.xn--p1ai \
  --build-arg NEXT_PUBLIC_YANDEX_MAPS_API_KEY="$YANDEX_MAPS_PUBLIC_KEY" \
  --build-arg NEXT_PUBLIC_YANDEX_METRIKA_ID="$YANDEX_METRIKA_COUNTER_ID" \
  --build-arg DOCKER_BUILD=1 .
docker push cr.yandex/<REGISTRY_ID>/lemuria-park:<git-sha>
```


`YANDEX_MAPS_PUBLIC_KEY` — ключ JavaScript API 3.0 с разрешённым HTTP Referer для публичного домена. Яндекс Метрика по умолчанию использует счётчик `113976341` в публичном layout; `YANDEX_METRIKA_COUNTER_ID` нужен только для переопределения (при сборке не передавайте пустое значение, если не нужно). `NEXT_PUBLIC_*` встраиваются в клиентский код во время сборки. Без ключа карты отображается запасной блок. На страницах с согласием на аналитические cookie необходимо согласовать фактическую загрузку счётчика с выбором пользователя.

В контейнере: `npx prisma migrate deploy`.  
`prisma db seed` в production запрещён.

Staging PASS (тот же image tag) → production. Не собирать «чуть другой» прод-образ руками.

## Честность провайдеров

- нет `YUKASSA_*` → онлайн не становится PAID
- нет Postbox → UI не показывает «отправлено»
- нет Object Storage ключей → не притворяться, что медиа в облаке

## Новый публичный домен (запрос 2026-11-01)

Целевой домен: `лемурияпарк.рф` (`xn--80ajjjbhwgdz8k.xn--p1ai`). Не путать с прежним `парклемурия.рф` (`xn--80akjgfhqje3a8k.xn--p1ai`). Перед переключением проверить фактического владельца домена, DNS/NS, текущую площадку, HTTPS сертификат и привязку домена к API Gateway. Только изменение `NEXT_PUBLIC_APP_URL` или GitHub кода не переключает DNS. Не заменять наугад webhook ЮKassa и не отключать прежний домен до подтверждения платежной цепочки.

Перед деплоем нового образа: проверить `ALLOWED_HOSTS` в активной ревизии Serverless Container, чтобы он включал `лемурияпарк.рф` и `www.лемурияпарк.рф`. Включить новый домен в Referer ограничения ключа Яндекс Карт JS API. Настроить на нём счётчик Метрики 113976341 один раз. Отдельно проверить выбранную локацию и наличие записей `Session` в БД после 14:00.
