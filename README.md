# Лемурия Парк — Next.js 15

## Stack

Next.js 15, React 19, TypeScript, Tailwind, shadcn-compatible UI, Prisma/PostgreSQL.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Routes

Pages: `/`, `/tickets`, `/checkout`, `/success`, `/about`, `/location`, `/staff`, `/admin`.

Legacy prototype API (static/mock data, kept as-is): `/api/config`, `/api/sessions`, `/api/reservations`.

Database-backed public API (see below): `/api/public/config`, `/api/public/sessions`,
`/api/public/reservations`, `/api/public/reservations/[id]`.

Copy `.env.example` to `.env` before database and integrations. ЮKassa, email and QR are
intentionally left behind production adapter interfaces until credentials are supplied.

## Database setup

1. Copy the env file and point `DATABASE_URL` at a real PostgreSQL instance:

   ```bash
   cp .env.example .env
   # edit .env, e.g.:
   # DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lemuria"
   # NEXT_PUBLIC_APP_URL="http://localhost:3000"
   ```

   `src/lib/config/env.ts` validates required variables at startup (via Zod) and fails fast with a
   readable error if something required is missing or malformed.

2. Generate the Prisma client:

   ```bash
   npx prisma generate
   ```

3. Apply migrations.

   - Local development (creates/applies migrations interactively, keeps the DB in sync with
     `prisma/schema.prisma`):

     ```bash
     npm run prisma:migrate
     ```

   - CI / production (applies existing migrations only, never generates new ones):

     ```bash
     npm run prisma:deploy
     ```

   An initial migration is already committed at `prisma/migrations/*_init_ticketing_foundation`,
   generated from the schema with `prisma migrate diff` (no live DB connection required to
   generate it). Running the commands above against an empty database will apply it.

4. Seed demo data (idempotent — safe to run multiple times):

   ```bash
   npm run prisma:seed
   ```

   This creates:
   - `SiteSettings` / `ContactSettings` singletons,
   - an `OWNER` user (`owner@lemuriapark.ru`) and a `CASHIER` user (`cashier@lemuriapark.ru`),
     both with password `ChangeMe123!` (hashed with bcrypt — **change before any real deployment**),
   - two `TicketType`s (`ADULT`, `CHILD`) with weekday/weekend `PriceRule`s,
   - one demo `Location` (Moscow, VDNH) with a daily `LocationSchedule` (10:30–21:00, every 30 min),
   - seven days of `Session`s generated from that schedule (the very first session has its
     capacity intentionally overridden to `10` to demonstrate the per-session capacity override),
   - a couple of `FaqItem`s and one `GalleryItem`.

5. Inspect data visually (optional):

   ```bash
   npm run prisma:studio
   ```

## Public API

All routes under `/api/public/*` return a single, uniform JSON envelope:

```jsonc
// success
{ "ok": true, "data": { /* ... */ } }
// error
{ "ok": false, "error": { "code": "SESSION_FULL", "message": "...", "details": { /* optional */ } } }
```

- `GET /api/public/config` — site name/CTA/session interval, contact info, active/upcoming
  locations and active ticket types. All values come from the database.
- `GET /api/public/sessions?locationSlug=<slug>&date=YYYY-MM-DD` — upcoming sessions for a
  location (defaults to the current `ACTIVE` touring location) with live `available` seat counts
  and server-computed weekday/weekend prices per ticket type.
- `POST /api/public/reservations` — creates a temporary seat hold.
  ```jsonc
  {
    "sessionId": "<id from GET /sessions>",
    "items": [
      { "ticketTypeCode": "ADULT", "quantity": 2 },
      { "ticketTypeCode": "CHILD", "quantity": 1 },
    ],
    "customerName": "Иван Иванов",
    "customerPhone": "+79991234567",
    "customerEmail": "ivan@example.com",
    "idempotencyKey": "optional-client-generated-key",
  }
  ```
  The hold expires after 15 minutes. Price and total are always computed server-side inside a
  `Serializable` database transaction, so concurrent requests can never oversell a session's
  capacity — see `src/server/services/reservations.ts`.
- `GET /api/public/reservations/[id]` — looks up a reservation by its public id (never the
  internal database id).

None of these routes expose `visitDurationMinutes` or any internal database id — only `publicId`
values (called `id` in the JSON) and human-safe fields are returned.

## Architecture notes

- `prisma/schema.prisma` — full ticketing data model (users/roles, locations & touring schedule,
  ticket types & weekday/weekend price rules, sessions, reservations, orders, payments, tickets &
  check-ins, site/contact settings, FAQ, gallery, audit log).
- `src/lib/db/prisma.ts` — safe `PrismaClient` singleton (survives Next.js dev hot-reload).
- `src/lib/config/env.ts` — Zod-validated environment variables.
- `src/lib/api/response.ts` — unified success/error response helpers + Prisma error mapping.
- `src/lib/validation/reservation.ts` — Zod input schemas for the public reservation API.
- `src/lib/datetime.ts` — timezone-correct weekday/weekend + calendar-date helpers (uses the
  platform `Intl` API — no extra date/timezone library needed).
- `src/server/services/pricing.ts` — resolves the active price for a ticket type at a location on
  a given date; always server-side, never trusts client-sent prices.
- `src/server/services/availability.ts` — computes remaining seats for a session across both
  online reservations/orders and cashier orders.
- `src/server/services/reservation-cleanup.ts` — expires stale `PENDING` holds so seats free up.
  In production, also invoke this on a schedule (cron / scheduled function), not just opportunistically.
- `src/server/services/reservations.ts` — creates a reservation inside a `Serializable`
  transaction with automatic retry on write conflicts; supports idempotent replay via
  `idempotencyKey`.
- `src/lib/audit.ts` — writes `AuditLog` entries (used by the reservation service today; ready for
  admin/cashier actions in the next sprint).

## Next steps (not part of this stage)

Payments (ЮKassa), signed QR codes / ticket check-in, email delivery, authentication & role guards,
and the admin/cashier UIs are intentionally out of scope for this stage — see
`docs/ARCHITECTURE.md` for the full implementation order.
