# Production invitation registration and finance regression, 10 November 2026

Production application release: `printed-invitations-20261110-5fbc46d2`.
Application source: `5fbc46d238e7508f8524fecd63b9b4d9383c27f5`.
Image: `sha256:360c8f43ac646c7300c19d6379fcb6966f557aa3cd08304af8535ac0d2a6cad5`.
Production revision: `bbahqj0ai4kc9q83efpa`.
Last production verification: 2026-11-10 20:56:01 Europe/Moscow.

## Application and invitations

An additive layer on the existing finance-safe production image adds an
authenticated invitation lookup before the ordinary paid-ticket lookup.
Ordinary paid QR values bypass the invitation event store. Existing cashier
authentication, shift-open requirement, rate limiting and location scope apply.
No migration, paid order, reservation, provider charge or historical financial
rewrite was performed in production.

Invitation issuance and admission use existing append-only AuditLog events.
PostgreSQL row locks and unique use-event identifiers permit one admission
under simultaneous scans. Cancelled, expired, wrong-location and disallowed-day
invitations are denied without consuming an admission. Saratov local time is
used. This batch is one guest per invitation, Monday/Wednesday/Thursday/Friday,
through 20 December 2026; Tuesday is closed. Staff must check available places.

The original set of ten printed invitations was registered in production.
At issuance, registered=10 and used=0. No real invitation was consumed by QA.

**Replacement remains pending approval.** The initial source commit included
the original printed values. They must be treated as exposed. A new set of ten
PDFs with fresh private values has been prepared and all ten QR values decoded
from their rendered PDF pages. Its values are kept outside GitHub. The original
values have NOT been cancelled, and the replacement set has NOT been registered:
automatic approval review rejected revocation/reissue because the user had
explicitly authorized registration, but not cancellation of already-issued
invitations. Obtain explicit approval to cancel those ten and activate the new
set before invoking the request-data-only private registration worker. The
prepared draft archive explicitly states it is not active and must not be issued.

The follow-up source removes the original literals from the branch tip and
disables the obsolete production issuance entrypoint. Historical commits still
contain them; removal from the latest source does not revoke a ticket.
`invitation-register-private-worker.cjs` receives new values only through an
IAM-private request body and returns counts, never QR values. It is restored
to the pre-task private worker configuration after use. It is not a public API.

## Validation

- 23 local invitation and financial-policy tests passed.
- On isolated staging PostgreSQL, eight simultaneous scans gave exactly one
  SUCCESS and seven ALREADY_USED responses.
- Tuesday, weekend, expiry and wrong-location denial passed.
- A separate synthetic cashier authenticated to the real staging API. The
  scanner correctly required an open shift; after a synthetic shift was opened,
  the invitation returned WRONG_DATE on Tuesday, 10 November. The test shift
  was closed, account disabled and sessions revoked. QA invitations were cancelled.
- Staging and production ran the identical pinned application digest.
- On both public domains, HTTPS requests succeeded with HTTP 200 and no
  redirect. Both live endpoints reported source `5fbc46d238e7508f8524fecd63b9b4d9383c27f5`;
  both readiness endpoints returned database=ok. This checks connectivity only.
- At 20:45:51 Moscow, public home response time was 1.10s; CRM home 0.17s.
- Final production revision/digest/readiness verification and private worker
  restoration passed at 20:56:01 Moscow.
- Physical phone camera/USB-scanner acceptance was not performed. Decoding PDF
  QR images and API admission tests do not prove physical-device camera behavior.

## Finance

The existing production finance-safe release was retained and revalidated on
the new image with six real staging API acceptance checks and separate cashier
and director accounts. All six passed:

1. CASH salary, expense and temporary-staff payouts from the safe at a zero
   shift-drawer balance, without creating drawer withdrawals.
2. Idempotent retry of the same expense/payroll entry.
3. Cashier report totals and 5% per permanent employee from feed/photo.
4. Director period report queries and location scope.
5. PDF export containing the same financial sections.
6. Cancellation of a safe expense without adding fictitious drawer cash.

Synthetic staging records were cancelled, users disabled, sessions revoked
and the synthetic shift closed. No provider transaction occurred.

Report order remains: tickets by nominal with cash/card split; feed; photo;
balabas; overall receipts/refunds; operating expenses; temporary staff; permanent
salary/advances; commission accrued/paid/remaining per permanent employee; gross
operating profit. Online orders remain excluded. Historical records mistakenly
entered as CARD require an individual factual reconciliation; no automatic
CARD-to-CASH conversion was performed.

## Rollback

Previous production revision: `bbaa3g6ejm5kncchpedk`.
Previous application digest:
`sha256:e526be7e86fc98a81f8546798754986094b29df2186fea80cda8a29398dc0982`.
Private Cloud Shell snapshots preserve environment, runtime settings and secret
references. Restoring an application image does not cancel registered invitation
events. Invitation cancellation is a separate append-only action.
