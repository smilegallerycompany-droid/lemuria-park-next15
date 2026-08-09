# CMS, Order Timeline & Director Dashboard

## Models

| Model | Role |
|-------|------|
| `SiteSettings` | Hero (badge/H1/subtitle/description/CTA/image/active), About (eyebrow/title/description/`aboutBenefits` JSON), contacts meta |
| `FaqItem` | FAQ CRUD with `isPublished`, `sortOrder` |
| `GalleryItem` | Gallery metadata + optional `MediaObject` link |
| `MediaObject` | Storage key/url/mime/size — **never base64** |
| `OperationalEvent` | System health signals for admin |
| `ContactSettings` | Public contacts |

Migration: `20260809020000_cms_timeline_dashboard`

## Public binding

`GET /api/public/content` → Hero, About, FAQ (active only), Gallery (active), Location, Contacts, schedule preview.

Homepage (`src/app/(public)/page.tsx`) reads CMS with safe fallbacks from `src/lib/cms/defaults.ts`.

## Cache invalidation

CMS writes call `revalidatePublicCms()` → `revalidatePath("/")` + `revalidateTag("public-cms")`.

## Director Content

`/director/content` — Hero editor + preview, About benefits, FAQ CRUD (archive/restore), Gallery upload/metadata.

APIs:

- `PATCH /api/director/content` — site/contact (+ hero/about)
- `POST/PATCH/DELETE /api/director/content/faq[/:id]`
- `POST/PATCH/DELETE /api/director/content/gallery[/:id]` (multipart upload)

## Order timeline

`GET /api/director/orders/[number]` includes `timeline` built only from real rows (reservation, order, payments, tickets, deliveries, check-ins, refunds, webhook audit).

UI: `/director/orders/[number]` + payment detail `/admin/payments/[id]`.

## Director «Сегодня»

`GET /api/director/overview` — KPIs vs yesterday, compact charts, upcoming sessions (`AVAILABLE|LOW|SOLD_OUT|CLOSED`), actionable alerts.

## Admin system

`GET /api/admin/system` — Database / Payment / Email / Cron / Webhook / Storage / Maps / Error monitoring with `OK|WARNING|ERROR|NOT_CONFIGURED|UNKNOWN`.

## Media storage

`MediaStorage`: `upload` / `delete` / `getPublicUrl`.

- Dev: `LocalMediaStorage` → `/public/uploads`
- Prod without credentials: `NOT_CONFIGURED` (upload blocked)

## RBAC

Writes: `requireDirector` / `requireAdmin` + `assertLocationAccess` + `AuditLog` (no binaries/secrets).
