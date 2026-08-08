# Mobile QR scanner (cashier)

Route: `/cashier/scan`  
API: `POST /api/cashier/check-in` with `{ qrToken }` only (no video upload).

## Modes

1. Camera (user gesture required: «Включить камеру»)
2. Manual token input
3. USB/Bluetooth keyboard-wedge (keydown buffer + Enter)

## Detection stack

1. Native `BarcodeDetector` when available
2. Fallback: `@zxing/browser` (`BrowserMultiFormatReader`)
3. Never more than one QR library path active

## Security / ops

- HTTPS required for camera (localhost allowed for dev)
- Permission requested only after button click
- Default facing mode: `environment` (rear)
- Camera switch + torch via feature detection (`getCapabilities().torch`)
- Tracks stopped on unmount / close / result screen
- Offline: never confirm VALID; show network message
- Duplicate client guard: same token ignored for 4s (`shouldAcceptScan`)
- Sound/vibration respect user preferences (`localStorage`)

## Result UX

| Result | Tone | Message focus |
|---|---|---|
| SUCCESS | green | Вход разрешён |
| ALREADY_USED | yellow | already used + first usedAt |
| EXPIRED | yellow | ticket date vs today |
| CANCELLED / INVALID | red | human message, no internal codes |

## PWA

`public/cashier-manifest.webmanifest` — standalone, `start_url=/cashier`.  
No aggressive service worker caching of auth/check-in/orders/analytics.
