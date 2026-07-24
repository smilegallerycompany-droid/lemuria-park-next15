# Production architecture

Next.js 15 App Router, React 19, strict TypeScript, Tailwind, shadcn-compatible primitives, Prisma/PostgreSQL, route groups `(public)`, `(staff)`, `(admin)`, ports/adapters for ЮKassa, email and QR.

## Next implementation order

1. PostgreSQL + migrations
2. Auth and role guards
3. Transactional capacity checks
4. 15-minute reservation expiration
5. ЮKassa + webhook
6. Signed QR + tickets
7. Email
8. Cashier and scanner
9. Admin reports
