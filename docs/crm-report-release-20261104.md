# CRM report release — 2026-11-04

The director's finance report previously included ONLINE payments in onsite
revenue. The requested scope is now explicit: exclude online orders and their
refunds; keep onsite tickets, feed, photos, Balabas and existing expenses.

## Published build

| Item | Value |
|---|---|
| Release | `crm-cashier-reports-20261104-90150ff6` |
| Production revision | `bbavrno949hepsdr5n2h` |
| Image digest | `sha256:85059a1fbc2d7925bbb45a33de363d7b9b82300c04cef07dc731f7b00369a123` |
| Builder source | `90150ff6da5b2ba02905f2201f0818d2010c498d` |
| Preserved base | `sha256:da1b62ffa61ffd6a7b63cdc96776efc1556ba31e9a433294bf16870b02e079fe` |
| Previous production revision | `bbade818m89f6qe0u4a3` |
| Staging database | `lemuria_staging` |
| Production database | `lemuria` |

The live October accounting implementation is newer than the source snapshot.
Rebuilding that snapshot would remove functionality. This release is a pinned,
assertion-checked overlay of the actual production artifact. It changes no
dependency, Prisma client, schema, payment handling, booking or authentication.

## Changes

- Finance payment and refund queries require the related order's source to be
  CASHIER, in addition to the existing location, date and status conditions.
  The shared finance service also supplies the PDF export.
- The cashier menu now links directly to `/cashier/shift` as **Отчёт**. This is
  the existing form for the cashier's own shift, not a new global finance grant.
- The administrator menu adds **Заполнить отчёт**, opening existing analytics
  with `source=CASHIER`. The existing report-entry form saves entries for the
  director to read. No staff role or location assignment was changed.
- The director's fill-report link also selects CASHIER.
- Six cashier mobile navigation items get six equal CSS columns.
- Changed JS/CSS assets receive new hashes, and generated references are
  rewritten. Existing immutable assets remain in the base image for rollback.

## Validation

1. The builder found exactly one shared finance module, both report filters,
   both client/server navigation copies, both finance UI copies and the mobile
   CSS rule. Twelve checks of the actual generated filter expressions passed;
   changed JS passed syntax checks.
2. The candidate image was deployed to staging first. Readiness and PostgreSQL
   connectivity passed. The live staging manifest matched the candidate.
3. A private acceptance worker exercised the candidate's actual compiled
   finance function and PostgreSQL queries inside a staging transaction:

   | Fixture | Expected effect |
   |---|---:|
   | Cashier payment | +1,000 RUB ticket revenue |
   | Online payment | 5,000 RUB excluded |
   | Feed sale | +300 RUB retained |
   | Cashier refund | 200 RUB retained |
   | Online refund | 300 RUB excluded |
   | Expense | 50 RUB retained |
   | Net change | +1,050 RUB |

   All expectations passed. The transaction was deliberately rolled back, and
   a subsequent query confirmed zero committed fixture orders. No deletion,
   database reset, migration or external payment was performed.
4. The new image was checked separately against production using READ ONLY
   transactions before public promotion. The 3,100 RUB online payment on the
   checked day was excluded from onsite finance revenue.
5. After promotion, the signed-in production report displayed zero onsite
   revenue for that day; the downloaded PDF contained the same zero totals.
   The administrator link selected **Продано кассиром**, and the fill-report
   button expanded the existing entry form. The cashier report menu and form
   were present.
6. Public site and CRM readiness returned database OK. Eight actual JS/CSS
   resources from the public HTML returned HTTP 200. Saratov still returned
   21 sessions on 2026-11-07, from 10:30 through 20:30 local time.

## Rollback and remaining audit

Private revision snapshots, candidate metadata, acceptance results and the
deployment helper are retained in the owner's Cloud Shell directory
`~/lemuria-crm-report-fix-20261104`. To roll back this image while it remains
active, run:

```sh
python3 ~/lemuria-crm-report-fix-20261104/cloud-crm-report-release.py rollback-production
```

The helper refuses an unexpected current revision/digest. Rollback restores
the prior image and its saved configuration; no database rollback is needed.
Snapshots and staff rosters must not be committed to this public repository.

The individual staff-account audit and three training manuals are not yet
complete. The real employee roster/role/location mapping is still required.
The UI checks above used the owner's account; they do not establish that each
employee has been tested. No employee role was silently changed.

The mobile CSS was updated, but a physical phone or controlled mobile viewport
has not been verified. Browser zoom shortcuts did not change the viewport and
must not be reported as a mobile test. The downloaded finance PDF has a minor
existing pagination issue: its final safe-balance explanatory sentence is on a
second page. Monetary totals and download behavior passed; layout improvement
remains part of the broader CRM audit.
