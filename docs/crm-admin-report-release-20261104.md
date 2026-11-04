# CRM administrator report release — 2026-11-04

Production release: `crm-admin-reports-20261104-10a09198`.
Builder commit: `10a09198e3982e8aa82ed8583644ff6b0637f79b`.
Pinned image: `sha256:c524919964093de59cfe2449ef9a6bfe48925b04eae1a0d811e9b37b0bac9589`.

The ADMIN portal previously redirected to the director workspace but excluded its finance navigation, page, API GET and PDF GET. These read paths now permit ADMIN while applying the existing assigned-location policy. Cashier-wide finance and online-manager access remain denied. Cashiers retain their own shift report form. Finance balance-confirmation POST remains restricted to DIRECTOR/OWNER; observer restrictions remain intact.

The live cashier-only payment/refund filter is preserved. Feed, photos, Balabas and expenses remain included. The PDF safe-balance label now states that it is a factual balance rather than profit, and the orphan explanatory paragraph is removed. No dependencies, migrations, seed data, payment provider configuration or credentials were changed.

## Validation

- New immutable image deployed to staging with the separate `lemuria_staging` database before production.
- Actual compiled finance service: ADMIN assigned location allowed; foreign location forbidden; CASHIER and ONLINE_MANAGER global finance forbidden.
- Staging fixture transaction: onsite ticket 100000 kopecks, feed 30000, cash refund 20000, expense 5000; expected net 105000. Online payment 500000 and online refund 30000 excluded. Deliberate transaction rollback, zero fixture orders committed.
- Production read-only preflight used the newly created active administrator profile and its real single-location assignment. All location-scope assertions passed. No credential hash selected and no application login impersonated.
- Production read-only comparison confirmed that online payments are excluded from cash-register finance; business totals are omitted from this public record.
- Public site and CRM readiness endpoints confirmed PostgreSQL health. Eight actual JS/CSS assets returned HTTP 200; the checked Saratov date exposed 21 sessions through 20:30 local time.
- Owner UI finance rendering and PDF download checked after deployment. Empty-day report has one page and expected zero financial totals.
- Temporary private QA and account-recovery endpoints both return HTTP 410; diagnostic database secrets and networking removed.
- Three role guides generated, text checked and all pages rendered and inspected.

## Rollback

Prior production revision: `bbavrno949hepsdr5n2h`.
Prior immutable digest: `sha256:85059a1fbc2d7925bbb45a33de363d7b9b82300c04cef07dc731f7b00369a123`.
Private deployment configuration snapshots remain in the authenticated Cloud Shell directory `~/lemuria-crm-admin-report-fix-20261104`.

Use `scripts/cloud-crm-report-release.py` from commit `226bf93610dfbca5ddb1e91b1844740739b9e419` with `LEMURIA_CRM_RELEASE_DIR` set to that directory and action `rollback-production`. The helper verifies the current candidate digest before restoring the saved image and configuration. Database rollback is unnecessary; no schema or production test-data mutations were performed.

## Limits

The role check exercises actual compiled authorization and finance services; it does not claim each employee has personally signed in or used every state-changing control. Actual phone camera permissions, printer output, physical terminal reconciliation, and staff login practice still require on-site checks. No real production charge or refund was executed. Existing legacy shifts and unrelated paused locations were preserved.
