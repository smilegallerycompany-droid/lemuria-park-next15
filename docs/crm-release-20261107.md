# CRM production release — 7 November 2026

Published release: `crm-tickets-revenue-20261107-4ca654fa`.

| Item | Value |
|---|---|
| Builder commit | `4ca654fa50151a0894159738a296f05f7968ce90` |
| Immutable image digest | `sha256:1a99b528b4ab755889c057b06c65ca68316545aa7bcbdd990740ba39acce0587` |
| Production revision | `bba5no5fmeohv0r4hb2j` |
| Accepted staging revision | `bba9uidipjll8ba98r15` |
| Prior production revision retained | `bbarejmvsp7n2k0qu9b2` |
| Prior image retained | `sha256:3cd822308d4a3291ed40e34882401076cf93a1c9fa225a1ddb9dfc94d6ee81f7` |

## Behavior

- Director/admin ticket list formats session time using that session's location timezone. Existing Saratov tickets visibly show **16:30**, correcting the previous **15:30**. The API now returns the location timezone in its existing projection. Auth, scope, filtering, and ticket payload sanitation are unchanged.
- The finance screen and its PDF distinguish gross ticket revenue, gross add-on sales, and the overall cash total after refunds. Online orders remain excluded. Existing cash/card totals and gross-profit calculations are unchanged.
- Exactly three old shifts explicitly identified as test data by the owner were removed. A serializable transaction verified zero sales counters, zero order/sale relations, only opening cash records, and zero-value roster operations. It saved the full restorable archive in `AuditLog` before removing the three shifts and their six test-only dependent records. Production orders and payments were not modified. The UI subsequently showed zero open shifts.

## Acceptance evidence

- Staging was deployed and accepted before production. Both environments returned healthy readiness with `database=ok`; the published assets matched the manifest hashes.
- 51 checks exercised the actual compiled role/location policy. Administrator access to its assigned location succeeded; another location was rejected. Cashier and online manager access to global finance was rejected. This does not replace interactive login tests for every employee.
- A staging-only serializable fixture test exercised the compiled finance service: synthetic ticket sales 100000, add-on sales 30000, refund 20000 and expense 5000 kopecks produced net 105000. Synthetic online payment 500000 and refund 30000 were excluded. All fixtures rolled back; zero fixture orders remained.
- Seven local tests passed: actual ticket timezone rendering, actual finance card separation, PDF contract, unchanged API filtering, refusal of unsafe deletions, archive-before-delete ordering, and stable archive hashing.
- Production finance, ticket list and shifts were inspected in the authenticated browser. The production PDF downloaded successfully; its text and page rendering showed the three separate amounts.

## Source and deployment

The original complete production TypeScript checkout was not recovered. Rebuilding the older repository application would discard working runtime features. This release instead uses a versioned, assertion-guarded overlay on the exact retained production image. The builder changes seven identified rendering/API surfaces, updates hashed asset references and validates syntax. It never runs a migration or seed. The public release manifest records base digest, builder commit, changed files and their hashes.

Release procedure: `cloud-crm-completion-release.py snapshot`, `build COMMIT`, `deploy-staging`, `verify-staging`, then `deploy-production`, `verify-production`. The private snapshots are mode 0600 under a mode 0700 temporary directory; they may contain secrets and must never be committed. Existing cloud revision configurations are retained.

Rollback uses the retained prior digest and prior revision configuration. Within the same Cloud Shell workspace, run `cloud-crm-completion-release.py rollback-production`, then verify health and visible pages. Without that workspace, read the retained prior revision through the authenticated cloud API and redeploy its configuration with its immutable digest. Never print secret-bound configuration.

Test-shift restoration is independent of application rollback: the private maintenance helper can redeploy its IAM-only worker and restore the saved `AuditLog` archive by its private audit ID. A successful application rollback does not automatically restore test shifts. No IAM grants or public maintenance endpoint were added.

## Verification limits

- No real or provider-sandbox charge/refund was performed. The finance fixture test proves application accounting, not YooKassa end-to-end operation. Provider test credentials and an isolated test merchant must be verified before that test.
- No actual phone/iOS/Android or narrow-viewport browser interaction was completed. Desktop rendering alone is not a mobile acceptance test.
- Individual cashier/administrator/director/online-manager browser sign-ins were not completed without secure staging test logins. Pure policy and service checks are recorded separately above.
- `database=ok` establishes connectivity, not full data integrity.
