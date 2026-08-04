# Production architecture

Next.js 15 App Router, React 19, strict TypeScript, Tailwind, shadcn-compatible primitives, Prisma/PostgreSQL, route groups `(public)`, `(staff)`, `(admin)`.

Cloud target: **Yandex Cloud (RU)** + **ЮKassa**. No VPN required for Russian users.

## Implemented

1. PostgreSQL + migrations + seed (exhibition window, Tuesday closed, prices)
2. Public booking → reservation → order (idempotent, capacity-safe)
3. ЮKassa adapter + webhook (`/api/webhooks/yookassa`) — no fake PAID
4. Ticket issuance (`qrToken`) on PAID / cashier sale
5. Cashier login, sell, QR check-in
6. Honest email skip until Yandex Postbox credentials
7. Policy / offer pages; refund & print marked «Ещё не подключено»

## Remaining

1. Director analytics UI (services may exist in parallel repos)
2. Full Postbox SMTP/SigV4 wiring with production keys
3. Fiscalization nuances in ЮKassa receipt for complex carts
4. Hardware receipt printer adapter
