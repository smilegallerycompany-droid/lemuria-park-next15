# Admin system & public location map

## Roles

| Role | Access |
|---|---|
| CASHIER | Cashier portal + check-in |
| DIRECTOR | `/director` business UI |
| ADMIN | `/admin` + `/director` |
| OWNER | Full access; cannot be demoted/disabled by non-OWNER; last OWNER protected |

## Public location

- `GET /api/public/locations` — locations + schedule summary + next sessions
- Homepage `#location` — `WhereWeAreSection` + `LocationMap`
- Map: Yandex Maps v3 when `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` set; otherwise premium fallback card
- Route button uses `routeUrl` (or `mapUrl`) — never invents turn-by-turn

## Location fields

`addressLine2`, `email`, `routeUrl`, `mapZoom`, `mapLabel` (+ existing lat/lng/mapUrl)

## Admin routes

`/admin`, `/admin/locations`, `/admin/users`, `/admin/orders`, `/admin/payments`, `/admin/tickets`, `/admin/integrations`, `/admin/system`, `/admin/audit`, `/admin/settings`

## Media

`src/server/media/storage.ts` — LocalMediaStorage (dev), YandexObjectStorage interface (prod wiring pending). Never store base64 in DB.
