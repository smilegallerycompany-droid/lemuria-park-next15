# Visual → Production Integration Audit

Дата: 2026-08-04  
Ветка: `feature/lemuria-ticketing-platform`  
Production SOТ (бизнес-логика): `lemuria-park-next15`  
Visual SOТ (публичный дизайн): `lemuria-awwwards-frontend`

## Сравнение

| Область | Production next15 | Awwwards frontend | Решение |
|---------|-------------------|-------------------|---------|
| Prisma schema + migrations | Proven ticketing foundation | Расширенная копия | **Оставить next15** |
| Domain: pricing/availability/reservation/order | Serializable + FOR UPDATE + tests | Порт с правками | **Оставить next15** |
| Public API `/api/public/*` | Рабочий envelope + DTOs | Копия | **Оставить next15** |
| Cashier API | login/sales/sessions/orders | Копия + check-in | **Оставить next15**, check-in добавить точечно |
| Public UI (hero/booking/checkout) | shadcn + redesign WIP | Утверждённый awwwards | **Заменить визуалом awwwards** |
| Booking data wiring | `getPublicConfig/Sessions/createReservation` | Тот же клиент | **Сохранить API-контракт next15** |
| globals.css | Tailwind/shadcn tokens (cashier) | Полный public design system | **Не затирать**: public CSS отдельно |
| Тесты domain/concurrency | 58+ node:test | Порт | **Гнать next15 suite** |

## Что НЕ делать

- Не копировать awwwards Prisma поверх next15 migrations
- Не переписывать `src/server/**` ради UI
- Не превращать public UI обратно в shadcn
- Не создавать третью параллельную архитектуру

## План переноса

1. Audit (этот файл) + commit
2. Public assets (hero/gallery) + `public-awwwards.css`
3. Public pages: home / checkout / payment / success на awwwards markup
4. Booking widget: awwwards композиция + next15 `@/lib/api/public`
5. Public layout без shadcn header/footer (header внутри awwwards page)
6. Cashier/admin UI не ломать (корневой globals + shadcn остаются)
7. Проверки: test / typecheck / build
