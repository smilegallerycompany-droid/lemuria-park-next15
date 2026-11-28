# Evotor checkout candidate — not deployed

Status on 2026-11-27: source implementation prepared on `feature/evotor-checkout-cash`. This branch must not replace the production image as-is.

## Intended behavior

Card checkout creates a pending order and queues it for the location's terminal. The Android app opens the receipt and starts the explicitly selected bank payment performer. Cash checkout includes cash received and calculated change and submits a cash print command. Only matching fiscal evidence marks the order paid, records shift revenue and issues tickets. A declined pre-payment validation creates no paid totals. An uncertain transaction remains blocked for reconciliation rather than being dispatched again.

## Production compatibility

The deployed production image is `sha256:43000d6ee0539e58232d397d34430bf0897b988ccc2163f9c3d7144e9ea19acc` in registry `crprmg5vv1ubl0u4fpad/lemuria-app`. Its release manifest records `release-pdf-layout-fix-20261019`, git head `fd426265d236a2953b34b23de6e851399c1e1b02`, and `dirtyCheckout: true`. Additional compiled overlays contain price fingerprints, extra products, companion checks, capacity changes and location scoping that the available source branch does not reproduce.

The overlay scripts are available in the repository and the exact deployed image was exported and inspected in the project’s Cloud Shell. No Cursor installation or user-provided source archive is necessary. Integrate this candidate through a pinned overlay with explicit checks of the current compiled routes, or reconstruct and test the complete source/overlay chain first. Do not deploy a full build of this older source branch or overwrite the existing staging revision. The draft currently handles ticket lines; production extras, multi-session sales and their safeguards must be integrated explicitly.

## Configuration and migration

- Apply `20261127120000_evotor_checkout` only to an isolated test database first. The new queue table has unique order and fiscal-document identities.
- `EVOTOR_TERMINALS_JSON` is an array of `{id, locationId, tokenHash}`. Use a separate random bearer token of at least 32 characters for each terminal and store only its SHA-256 hex digest in this configuration. Never use the public connectivity-only label as a credential. Exactly one configured terminal is supported per location in this candidate.
- Configure the Android app UUID to the existing Evotor marketplace application. Keep the existing package and signing identity for an in-place upgrade; the previous APK signature has been verified, but the corresponding private signing key has not been located.
- Configure the API endpoint, token and product UUID mapping on the terminal. Select the installed bank application in settings. The generic cashless performer is intentionally excluded because it is not proof of a bank transaction.
- Validate the Evotor integration permissions and proxy allowlist for the exact endpoint through the existing application card.

## Verified locally

- TypeScript typecheck passed.
- Five mocked server service tests passed: credentials/location, no claim reissue after UNKNOWN, idempotent fiscal evidence, exactly-once revenue/ticket effects, decline with no revenue.
- Full Gradle 8.9 / AGP 8.7.3 APK build and 17 Android JUnit tests passed. Tests cover journal recovery, no redispatch, cash/change arithmetic, card validation, durable claim identity, lost open callbacks, late callbacks, corrupt journal, paused reception and failed result delivery. The extracted checkout engine is exercised without an Activity; these are JVM tests with a fake device, not hardware lifecycle tests.
- Migrated a disposable local PostgreSQL 16 database and passed the database scenario: competing claims, lost-response recovery, six duplicate cash callbacks and four card callbacks, exactly one receipt/ticket/ledger write, UNKNOWN stays unpaid, a completed claim cannot pick another job, pending checkout blocks closing a shift, duplicate fiscal identity and conflicting results are rejected, declined checkout adds no revenue. No live database writes were used.
- The full source test run passed 172 checks; nine database-dependent checks were skipped in that broad run. The specific checkout database scenario was then run separately against local PostgreSQL.
- APK 0.1.2 certificate SHA-256: `e697bff5efb8c5227b78f7fe6637a97a940550623535c6df19ddcec8092b1d10`. Current debug APK certificate: `9622d9f88dc5a6ea6974acbc147074e71cc51c54300e48f0515064e158520825`. These differ. Do not present the current APK as an in-place upgrade; no APK was uploaded to Evotor.

## Remaining release checks

1. Merge against complete current production sources and cover extras, companion validation, location authorization, capacity and online/cash separation without regression.
2. Repeat the passed local database checks against the final production-compatible staging image, including extras and two-session sales.
3. Exercise browser reload/network loss and every Android journal phase on a test terminal. The durable claim UUID is stored before HTTP and reused to recover a lost response. Operator reconciliation for uncertain bank/receipt outcomes still needs a verified device workflow.
4. Verify cash received/change representation, fiscal receipt fields and permissions on actual Evotor firmware. Confirm real Sber performer behavior including cancellation, decline and paper-out. Never turn an uncertain response into a second charge.
5. Background reception is now owned by a non-exported foreground service with an ongoing notification. The reception switch persists; boot/package replacement resumes enabled reception or unfinished work. A single process-wide executor serializes commands and callbacks across service recreation. Pausing reception stops new claims but continues recovering an in-flight claim and reporting its result. Verify this on real firmware: Android 10+ restricts background Activity launches, and forced stop / device power-management can prevent automatic recovery. Operator reconciliation of uncertain bank outcomes still needs a verified device workflow.
6. Only after staging validation, produce the correctly signed APK and deploy a coordinated CRM/API update. Confirm a single authorized test sale produces one bank transaction, one fiscal receipt and one CRM entry.

## Continuation verification — 27 November 2026

- Reopened the existing Cloud Shell session and inspected the exported production cashier sales route. It still performs price fingerprint, companion, secondary-session and extras checks before `createCashierPaid`, shift recording and ticket issuance. The new service work does not modify that deployed route.
- Added and passed a server regression check: reassigning a terminal to another location cannot recover and disclose its former location's claim. All five focused server tests and TypeScript checks passed.
- Background service uses the SDK context transport and `ActivityStarter(context, true)` for opening receipts, because the public `OpenSellReceiptCommand.process` overload requires an Activity. Device verification must cover this transport as well as Sber.
- Relevant platform references: https://developer.android.com/develop/background-work/services/fgs/launch and https://developer.android.com/guide/components/activities/background-starts .

- Additional Android lint was attempted but did not complete: an uncached `androidx.arch.core:core-runtime:2.0.0` dependency could not be fetched (direct network unavailable; proxy TLS trust failed). TLS validation was not disabled. This does not replace the successful APK build and 17 JUnit checks; lint remains a release check.

## Immutable receipt snapshot — 27 November 2026

- New cashier checkout jobs store `receiptPayload` (version 1): exact product codes, quantities, line amounts and total. Claims no longer rebuild fiscal lines from the current ticket catalog. The result handler validates the stored receipt before accepting fiscal success.
- Migration `20261127150000_evotor_receipt_snapshot` adds a nullable JSONB field. Old candidate jobs without a snapshot fail closed and require reconciliation; they are not automatically reconstructed, cancelled, paid or retried.
- `prepareQuotedEvotorReceipt` accepts the observed production quote structure (ticketTypeId, optional secondarySessionId, separately priced extras) and server catalog rows. It preserves bundle quantity and adds FEED/PHOTO lines without treating them as tickets. It does not replace server pricing, fingerprint, companion, capacity or location checks.
- This adapter is not yet connected to the deployed compiled sales/standalone-entry routes. Current source cashier-sale input still accepts tickets only. Standalone extras accounting remains a separate integration task; encoding its fiscal lines does not establish end-to-end support.
- Fresh broad test run: 178 passed, 9 database-dependent skipped, zero failures. Separate disposable PostgreSQL 16 scenario passed after the tenth migration, including catalog-code mutation between claim/recovery, concurrent claims and repeated fiscal callbacks. TypeScript passed. Android APK build and 17 JUnit tests passed; one new test covers ticket/feed/photo and standalone-goods payloads.
- Zero-value fiscal lines are rejected before queue creation, consistent with the current Android protocol. This does not implement free-ticket issuance through the cash checkout flow.
