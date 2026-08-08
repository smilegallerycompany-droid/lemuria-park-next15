# Manual QA — analytics / scanner / internal UI

## Director

- [ ] `/director` shows today KPIs from PAID-only analytics
- [ ] `/director/analytics` filters update URL without full reload
- [ ] Reset clears filters
- [ ] KPI comparison labels for zero baseline
- [ ] Charts render / empty states
- [ ] Heatmap readable
- [ ] Sessions CSV downloads with active filters
- [ ] Location access denied for foreign locationId
- [ ] Tablet: menu drawer works
- [ ] Desktop 1440/1280 layouts without horizontal overflow

## Cashier profile

- [ ] Own profile loads
- [ ] Stats match own sales
- [ ] Password change success + wrong password
- [ ] Revoke other sessions
- [ ] Prefs persist after reload

## QR scanner

- [ ] Idle screen before camera
- [ ] Camera starts only after button
- [ ] Manual VALID / ALREADY_USED
- [ ] USB wedge Enter submit
- [ ] Camera tracks stop after result / leave page
- [ ] Offline message blocks VALID
- [ ] Phone portrait + landscape safe areas
- [ ] Bottom nav not covering content

## Screenshots (local, do not commit PII)

Suggested path: `docs/qa-screenshots/`

- director-dashboard-desktop.png
- analytics-desktop.png
- analytics-tablet.png
- revenue-graph.png
- occupancy-heatmap.png
- cashier-desktop.png
- cashier-mobile.png
- cashier-profile.png
- qr-before-camera.png
- qr-active-frame.png
- qr-valid.png
- qr-already-used.png
