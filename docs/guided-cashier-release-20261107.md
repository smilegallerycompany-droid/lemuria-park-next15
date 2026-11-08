# Guided cashier sale — 2026-11-07

Production verified at 13:37 Moscow time, 2026-11-07.

- Release: `crm-guided-sale-20261107-b509d13c`
- Builder commit: `b509d13c457f62bb92494c4d9e2fc7db96a7ebf3`
- Immutable image: `sha256:012c2ea57d26ac12a8e781f971447fe391a76b6289b3c9b0c261d7a581fec91c`
- Production revision: `bbavm7m7jqmq1lq46bq3`
- Rollback base: `sha256:1092b51aaa8e6496044034f2d3250b53f55ba5023ae393c7420ff87be1933475`, previous production revision `bbao8u1qqgevfmetj8gs`.

The current catalogue already supported FEED and PHOTO with order extra lines. This release makes those controls discoverable through explicit steps: tickets → feed/photo → payment/save. Session selection no longer says that it completes a sale. Payment confirmation remains required. Its actions remain accessible on a 340×234 CSS-pixel viewport; the description scrolls within the constrained dialog. Real physical phones were not tested.

No catalogue price, sale API, accounting, role permission or database schema changed. The exact sale handler remains unchanged. Current configured “Фото в зале” is a separate catalogue item from printed souvenir photos.

Validation:
- Seven focused tests passed against the actual deployed client bundle, including guided navigation without side effects and preservation of sale/payment handlers.
- Both server/client cashier components and both current CSS copies patched; all modified JS syntax checks passed.
- Staging live/ready and all three changed static asset hashes verified before production.
- Five actual staging HTTP/DB checks passed: quote with feed/photo; paid cashier order with separate extra lines and one issued ticket; safe idempotent retry; visibility in cashier order list including extras; shift sale counted exactly once.
- The first test fixture selected a price without a configured rule; it was corrected to the configured ADULT ticket in the LEMURIA location. The final acceptance run passed.
- Synthetic staging users were disabled, sessions revoked, created orders/tickets cancelled and the synthetic shift closed; evidence retained. No provider charge.
- Existing private IAM-only diagnostic container restored and restoration verified after read-only production diagnostics and after staging tests. No IAM policy changes.
- Public production health/live, health/ready and release manifest returned HTTP 200; builder SHA matched; database=ok; three static assets verified.
- Authenticated production browser checked: ticket 1100 ₽ + feed 300 ₽ + photo 200 ₽ = 1600 ₽, navigation to both later steps, payment confirmation opened and cancelled. Selection reset to zero afterwards; no production order/payment created.

Read-only production reconciliation found no hidden cashier orders at the time of investigation. The user then clarified that the cashier likely had not completed a sale because the interface was difficult to navigate. Historical order or shift data were not changed.

Rollback uses `cloud-crm-guided-release.py rollback-production` with its protected Cloud Shell snapshot; prior immutable image/revision remain retained.

Screenshot: [confirmation controls on short viewport](evidence/guided-sale-short-screen-20261107.png).
