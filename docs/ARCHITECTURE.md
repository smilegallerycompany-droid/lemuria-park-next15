# Production architecture (код)

Канон экосистемы: [`docs/ECOSYSTEM.md`](./ECOSYSTEM.md).  
Этот файл — снимок **уже реализованного** в репозитории. Не расширять public-сайт вместо продуктов кассы / директора / owner.

Стек: Next.js 15 App Router, React 19, TypeScript, Prisma/PostgreSQL.  
Облако: **Yandex Cloud (RU)** + **ЮKassa**. Без VPN для пользователей в РФ.

## Route groups сегодня

| Группа | URL | Целевой хост |
|---|---|---|
| `(public)` | `/` | `lemuriapark.ru` |
| cashier | `/cashier` | `cashier.lemuriapark.ru` |
| director | `/director` | `admin.lemuriapark.ru` |
| admin (служебное) | `/admin` | `owner.lemuriapark.ru` (ещё не отдельный продукт) |

Host-routing пока не включён: всё на одном origin. Цель — те же приложения по subdomain, без второй кодовой базы.

## Реализовано

1. PostgreSQL + migrations + seed (окно выставки, вторник выходной, цены)
2. Public booking → reservation → order (idempotent, capacity-safe)
3. ЮKassa adapter + webhook (`/api/webhooks/yookassa`) — без fake PAID
4. Выдача билета (`qrToken`) на PAID и кассовую продажу
5. Касса: логин, продажа, смена, QR check-in
6. Директор: аналитика, контент, смены, персонал (в рамках `/director`)
7. Честный skip email, пока нет Yandex Postbox
8. Медиа-порт: local / Yandex Object Storage (S3)

## Не делать вид, что готово

1. Четыре отдельных хоста + Certificate Manager / Cloud DNS
2. Owner как executive-продукт (сейчас `/admin` — операционный черновик)
3. Postbox SMTP/API в production + SPF/DKIM/DMARC
4. Timer-trigger cron в Serverless Containers
5. Monium + Audit Trails облака (прикладной AuditLog уже есть)
6. Restore drill Managed PostgreSQL
