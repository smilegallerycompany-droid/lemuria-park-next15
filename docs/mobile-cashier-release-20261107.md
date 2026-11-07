# Mobile cashier sale hotfix — 2026-11-07

## Production
- Release: `crm-mobile-sale-20261107-910694f9`
- Builder commit: `910694f930f99156c92d96ffa0f1e520e16d7062`
- Immutable image: `sha256:1092b51aaa8e6496044034f2d3250b53f55ba5023ae393c7420ff87be1933475`
- Production revision: `bbao8u1qqgevfmetj8gs`
- Staging revision: `bbaudonh6lekqnp5p17q`
- Previous image retained: `sha256:1a99b528b4ab755889c057b06c65ca68316545aa7bcbdd990740ba39acce0587`
- Previous production revision: `bba5no5fmeohv0r4hb2j`

## Trigger and behavior
On a narrow screen, session-card “Продать билет” selected the session but checkout remained below every session and recent sales. The handler now scrolls and focuses the existing checkout panel below 1024 CSS pixels. Added a return-to-sessions button, 44px panel touch targets and 16px inputs. Desktop selection behavior remains unchanged.

This overlay patches the exact running image, including its server and client cashier component and both CSS copies. It does not rebuild the stale full repository application. Existing payment handlers, calculations and sale API calls are unchanged.

## Evidence
- Eight targeted tests passed against the downloaded production cashier bundle: selection state, navigation at 340/390/768/1024/1440px, reduced motion, payment/sale preservation, reject unexpected/already patched source, touch styles.
- Build: cashierClient=1, cashierServer=1, cashierCss=2; syntax checks passed.
- Staging verified before production: health/live matches builder SHA; ready database=ok; all three changed public static JS/CSS hashes matched.
- Production repeated after revision routing settled: same checks passed, database=ok, assetsVerified=3.
- Independent public HTTP checks confirmed HTTP 200 and new release/SHA.
- Browser: production cashier form and staging cashier login render at 340 CSS px; document scrollWidth=337 (no horizontal overflow). Narrow desktop browser view is not physical-device testing.
- No application errors observed in browser capture; extension metadata errors were excluded as unrelated.

## Limits and safety
The existing browser account has no open production shift. No shift, sale, reservation, payment or refund was created for this hotfix. The exact checkout click was tested from the deployed compiled handler; full authenticated open-shift checkout and a completed sale on a physical phone remain unverified. No database migration or financial action occurred.

Rollback: run `cloud-crm-mobile-release.py rollback-production` in the authenticated Cloud Shell while its protected snapshot and image metadata remain available. The helper rejects unexpected active images and preserves the prior revision settings. Immutable prior image/revision are retained even if temporary shell snapshots expire.
