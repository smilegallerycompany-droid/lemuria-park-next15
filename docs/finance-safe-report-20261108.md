# Safe-funded payouts and ordered operating report

Source: `7b110ed4a489c16866f6d35592957446748dfe29`.
Image: `sha256:e526be7e86fc98a81f8546798754986094b29df2186fea80cda8a29398dc0982`.
Release: `finance-safe-report-20261108-7b110ed4`.

The cashier report previously treated cash payroll and operating expenses as
withdrawals from the current shift drawer. This blocked legitimate payments
funded from the safe when the drawer was empty. New cash salary, advances,
temporary-worker payments, operating expenses and commission payouts are
recorded as CASH with a safe source. They do not create a drawer withdrawal.
Existing drawer entries retain their original reversal behavior. Confirmed
cash/safe/bank balances remain factual balances entered through the existing
balance workflow; no inferred safe balance or money transfer is created.

The cashier report and director finance report now share these sections:

1. Tickets by nominal price, quantity, cash, card, total.
2. Feed, split cash/card.
3. Photo, split cash/card.
4. Balabas, split cash/card.
5. Overall receipts and refunds.
6. Operating expenses.
7. Temporary staff and their payments.
8. Permanent staff salaries and advances.
9. Permanent staff commission: accrued, paid per person, remaining.
10. Gross profit using the agreed operating-report formula.

Only cashier orders are included; online orders remain excluded. Commission is
5% of feed/photo receipts in each shift in which the permanent employee is
listed. Duplicate attendance rows do not duplicate commission. Temporary
workers are excluded. Fully refunded order extras do not accrue commission.
Partial refunds do not identify refunded product lines, so this release does
not invent a product allocation for them.

Profit equals receipts less refunds, expenses, temporary-worker payments,
salary/advances and commission. For each person the larger of commission
accrued and actually paid is recognized, preventing double deduction while
including actual overpayments. This is an operating management report, not a
statutory accounting statement. Existing records mistakenly entered as CARD
must be identified and corrected individually; this release does not relabel
historical payments automatically.

Record cancellation, receipt attachment, staff attendance, feed inventory and
invitation controls are retained. The PDF uses the same report calculations.

## Validation

- 12 local calculation/rendering tests passed.
- Staging readiness: database=ok; seven changed public assets match their hashes.
- Staging revision: `bbae61g9dhaf0qcaqjp7`.
- Six real API staging acceptance checks passed with separate synthetic cashier
  and director accounts: safe salary/expense/temporary payments at zero drawer;
  idempotent entry retry; cashier totals and 5% per permanent worker; director
  scoped report; PDF response; safe-expense cancellation without creating cash.
- No provider charge and no production test fixture was created.
- Production published and verified: revision `bbaa3g6ejm5kncchpedk`, identical
  staging/production image digest, database=ok and seven changed assets verified.
- Both public domains returned HTTP 200 without redirection or error pages.
  Public site response: 1.19s; CRM login response: 0.19s. Both live endpoints
  reported source `7b110ed4a489c16866f6d35592957446748dfe29`; both ready endpoints
  reported database=ok. This checks database connectivity, not data integrity.
- Private QA worker restoration was verified after acceptance.
- No physical-phone acceptance or browser-authenticated report walkthrough is
  claimed by this release's API and calculation checks.

## Rollback

Previous production image:
`sha256:f0397810d5c91485b31d81f74384a84f03f0af67312eab5b70c7d23a1cce430f`.
Previous production revision: `bbas8je1k8gd0s27d8lq`.
The release script retains the full original revision configuration and secret
references privately. No migration, production fixture, payment-provider
transaction or historical data rewrite is part of this deployment.

The existing private QA worker is temporarily configured against
`lemuria_staging`, with migrations/seeding disabled, and restored afterwards.
Synthetic staging orders/tickets and entries are cancelled, test users disabled
and their sessions revoked; business records are not deleted.
