# Weekday invitations for Lemuria

Status: source prepared and locally validated; NOT DEPLOYED and no invitations
registered in production. Cloud Shell continued returning a session connection
error after a normal restart, full restart and fresh session on 2026-11-09.

Requested issue: 10 invitations, one guest and one admission each, lemurs only,
Monday through Friday in Europe/Saratov, open date, separate PDFs. Parrots are
outside the CRM scope. No customer messages or email delivery are requested.

The existing authenticated `/api/cashier/check-in` endpoint delegates only tokens
with the `LPINV1-` prefix to the new invitation policy. Existing paid tickets
continue through the original service. Existing authorization, role/location
scope and rate limiting apply before invitation handling.

For this small batch, the existing append-only AuditLog stores issued, used and
cancelled invitation events. It stores a SHA-256 token hash rather than the QR
token. The issue event is locked with PostgreSQL `FOR UPDATE` before the unique
use event is checked and created, in one READ COMMITTED transaction. Simultaneous
scans yield one successful admission. Unknown, malformed, cancelled, used,
foreign-location and weekend invitations fail closed.

The issue command accepts exactly ten distinct invitation numbers and hashes.
Issuance is atomic and idempotent. It validates the active Saratov location and
an active OWNER/DIRECTOR/ADMIN issuer. It creates no orders, payment records,
sessions, inventory allocations or financial totals. There is no automatic
startup seeding, schema change, migration or access change.

Validation completed:

- TypeScript typecheck passed against the existing repository dependencies.
- Ten tests passed against PostgreSQL in PGlite: exact batch size, idempotent
  issuance, first and repeat scan, parallel scan calls, Saturday/Sunday refusal,
  Saratov midnight boundary, wrong location without consumption, forged tokens,
  cancellation, ordinary-ticket bypass and atomic rollback on issue conflict.
- The local test adapter serializes PGlite transactions, which use one database
  connection. Parallel calls therefore test serialized state transitions; actual
  multi-connection PostgreSQL row-lock behavior still requires staging acceptance.

Before activation:

1. Restore authenticated deployment access. Inspect the current production
   immutable image and preserve its existing finance and mobile fixes.
2. Deploy only the check-in service change to isolated staging. Exercise actual
   authenticated API scans and concurrent database connections there.
3. Promote the same validated artifact to production with rollback metadata.
4. Generate ten cryptographically random tokens. Register their hashes with
   `issueBatch`; retain the plaintext tokens only in the ticket production input.
5. Confirm all ten production invitations are registered and unused. Generate
   ten separate PDFs and decode each QR from its rendered PDF to confirm the
   exact registered token. Deliver only after these checks pass.

Never describe a token as active, or distribute a final QR ticket, merely because
its QR image is readable. The previous manually numbered invitations are not
registered in CRM and are not a substitute for this activation.
