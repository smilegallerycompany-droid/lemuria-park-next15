# Verified order ticket recovery - production acceptance 2026-11-08

The live `/order` page successfully located paid orders but rendered only number, payment status, session and total. Its client component never rendered the existing `tickets` array returned by the number/email lookup. This prevented guests from recovering their QR tickets through that page even when issuance succeeded.

The patch renders all existing tickets for a paid order, labelled VALID/USED, with locally generated QR images. Cancelled/refunded/unpaid orders do not expose usable QR codes. Empty paid-order ticket arrays have a distinct recovery message. A local print action is available; browser/device print-to-PDF support remains dependent on the browser. The existing number/email check, backend authorization, payment processing, ticket issuance and mail delivery are unchanged. No QR payload is sent to an external image service.

## Release

- Builder/source commit: `b613567c76efcdb3745efe727fd50b2f68e98a46`
- Release: `order-ticket-recovery-20261108-b613567c`
- Immutable image: `sha256:f0397810d5c91485b31d81f74384a84f03f0af67312eab5b70c7d23a1cce430f`
- Staging revision: `bba6m29sob9pr4kvcodi`
- Production revision: `bbas8je1k8gd0s27d8lq`
- Rollback image: `sha256:cbfe23d7bf337b788c6484020ff24cf08aa0c6541b1afddcfb927683a64a88ae`
- Prior production revision retained: `bbadvjh291ebhq4sm454`

This is a narrow overlay on the exact running image. One client chunk plus its build/reference manifests are changed. Stale repository application sources were not rebuilt. No migration, order, reservation, charge, refund, ticket scan/check-in or mail resend was performed.

## Validation

- Six unit tests passed: all issued QR codes, unpaid/refunded restrictions, cancelled ticket restriction, empty issuance handling, used-ticket label, local print handler.
- Patched production client module executed in an isolated webpack/React test harness and rendered two ticket QR images for a synthetic paid-order response.
- Staging first: readiness database=ok, expected health SHA, immutable image and actual client asset checksum verified; browser lookup safely rejected an unknown synthetic order.
- Production asset checksum and health verified. Initial verification caught the old response while routing propagated; subsequent verification confirmed the new SHA and immutable release on the public endpoint.
- Authorized paid-order browser acceptance showed both issued tickets and the print action. Both QR codes were decoded from an actual production screenshot and matched the existing backend ticket tokens. Private screenshot/payloads are not included in this public repository.
- At a 340 CSS-pixel viewport (desktop browser zoom), QR images remain 240x240 with no horizontal document overflow. This is responsive layout verification, not a physical iPhone/Android test.
- The system print dialog did not open in the controlled Chromium environment; actual PDF saving through the new print button is not asserted.
- A matching ticket email was independently found in Postbox with Delivery and a Gmail SMTP `250 2.0.0 OK` acknowledgement. This proves recipient-server acceptance, not Inbox placement or guest opening. No email resend was triggered.

Rollback uses the protected release snapshot with `cloud-order-ticket-release.py rollback-production`. The prior revision and immutable image remain available even if an ephemeral Cloud Shell snapshot is lost; do not roll back the database.
