# Migration audit

Verified on throwaway Postgres (`lemuria_migrate_audit`) against Docker `postgres:16`:

```bash
docker exec lemuria-postgres psql -U lemuria -d lemuria_park \
  -c "CREATE DATABASE lemuria_migrate_audit OWNER lemuria;"

DATABASE_URL="postgresql://lemuria:lemuria@localhost:5432/lemuria_migrate_audit?schema=public" \
  npx prisma migrate deploy
# Applied: init_ticketing_foundation, order_payment_expiry_and_idempotency_hash, director_admin_panel

DATABASE_URL=... NODE_ENV=development npx prisma db seed   # OK
DATABASE_URL=... NODE_ENV=production  npx prisma db seed   # refuses (exit 1)
```

## Constraints checked in schema review

- Unique provider payment ids / order numbers / idempotency keys prevent duplicate financial rows.
- Ticket issuance is idempotent per order.
- Check-in concurrent SUCCESS collapsed to one row via transaction.
- Cascade must not delete PAID financial history when cleaning Tuesday demo sessions (seed skips delete when orders exist).
- Production: only `prisma migrate deploy` — never seed.
