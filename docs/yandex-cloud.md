# Яндекс Облако (production)

Стек рассчитан на работу из РФ **без VPN**: ЮKassa (`api.yookassa.ru`), Яндекс Облако (Managed PostgreSQL, Serverless Containers / Compute, Postbox, Object Storage при необходимости).

## Сервисы

| Назначение | Сервис |
|---|---|
| PostgreSQL | Managed Service for PostgreSQL (зона `ru-central1`) |
| Приложение Next.js | Serverless Containers или Compute Cloud + ALB |
| Почта билетов | Yandex Cloud Postbox |
| Оплата | ЮKassa (отдельный кабинет, webhook на `/api/webhooks/yookassa`) |
| Секреты | Lockbox → env контейнера |

## Деплой контейнера

```bash
docker build -t cr.yandex/<REGISTRY_ID>/lemuria-park:latest \
  --build-arg NEXT_PUBLIC_APP_URL=https://lemuriapark.ru .
docker push cr.yandex/<REGISTRY_ID>/lemuria-park:latest
```

Перед стартом контейнера:

```bash
npx prisma migrate deploy
npx prisma db seed   # только для первичного наполнения
```

## Переменные

См. `.env.example`. В production:

- `MOCK`/локальные секреты запрещены проверками в `src/lib/config/env.ts`
- без `YUKASSA_*` оплата **не** симулируется — заказ остаётся `AWAITING_PAYMENT`
- без Postbox email **не** помечается как отправленный

## Домен и HTTPS

ALB + сертификат Yandex Certificate Manager. DNS — у регистратора или Cloud DNS.
