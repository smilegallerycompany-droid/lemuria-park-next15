# Staging notes — RC2

Branch: `release/lemuria-ui-analytics-rc2`

## Merge target

Staging only. Do **not** auto-merge to `main`.

## Pre-merge checklist

- [x] Unit/integration tests
- [x] E2E suite
- [x] Lint / typecheck / build
- [x] Analytics manual verification (`docs/analytics-manual-verification.md`)
- [ ] Physical iPhone Safari QR on **HTTPS** staging URL
- [ ] Physical Android Chrome QR on **HTTPS** staging URL
- [ ] Staging smoke after deploy

## Physical QR

Status: **PHYSICAL_DEVICE_TEST_REQUIRED**

Camera APIs need a secure context. Use the deployed staging HTTPS origin — not plain LAN HTTP — for iPhone Safari.

## Rollback

Revert the release branch merge on staging if analytics KPIs diverge from `docs/analytics-manual-verification.md` formulas or if camera streams leak after backgrounding.
