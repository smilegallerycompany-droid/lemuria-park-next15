# IDN: парклемурия.рф

**Source of Punycode:** Python 3 `str.encode("idna")` and Node `url.domainToASCII` / WHATWG `new URL`. Round-trip verified. Not guessed.

## Mapping

| Unicode | ASCII (Punycode / ACE) |
|---|---|
| `парклемурия.рф` | `xn--80akjgfhqje3a8k.xn--p1ai` |
| `www.парклемурия.рф` | `www.xn--80akjgfhqje3a8k.xn--p1ai` |
| `cashier.парклемурия.рф` | `cashier.xn--80akjgfhqje3a8k.xn--p1ai` |
| `admin.парклемурия.рф` | `admin.xn--80akjgfhqje3a8k.xn--p1ai` |
| `stage.парклемурия.рф` | `stage.xn--80akjgfhqje3a8k.xn--p1ai` |
| `owner.парклемурия.рф` | `owner.xn--80akjgfhqje3a8k.xn--p1ai` (not published) |

TLD `.рф` = `xn--p1ai`. Latin labels (`cashier`, `admin`, `www`, `stage`) stay ASCII; only the registered name is IDN.

## Who uses which form

| Surface | Form |
|---|---|
| Browser address bar | Unicode `https://парклемурия.рф` |
| DNS queries, NS, whois | ASCII `xn--80akjgfhqje3a8k.xn--p1ai` |
| Host header (typical) | ASCII |
| `ALLOWED_HOSTS` compare | ASCII (Unicode input is normalized) |
| `NEXT_PUBLIC_APP_URL` | Unicode preferred: `https://парклемурия.рф` (Zod `.url()` accepts both) |
| HTML canonical / OpenGraph / sitemap | Unicode origin |
| Cookie `Domain` | **do not set** (host-only). If ever set, must be `.xn--80akjgfhqje3a8k.xn--p1ai` — never Unicode |
| Certificate Manager / API Gateway | try Unicode in UI; store/match ASCII if the form converts |
| YooKassa webhook | `https://парклемурия.рф/api/webhooks/yookassa` — also valid as `https://xn--80akjgfhqje3a8k.xn--p1ai/api/webhooks/yookassa` |
| Postbox sender domain | **Punycode** in console (`xn--80akjgfhqje3a8k.xn--p1ai`). From: `tickets@xn--80akjgfhqje3a8k.xn--p1ai` (same mailbox as `tickets@парклемурия.рф`) |

## Cookie / auth

`lemuria_staff_session`: `httpOnly`, `sameSite=lax`, `secure` when `NEXT_PUBLIC_APP_URL` is `https://`, `path=/`, **no `Domain`**.

Host-only cookies isolate cashier / director / (future) owner after DNS split. Staging path-mode on one Gateway host still shares the cookie (same host). Do not set `Domain=.парклемурия.рф`.

HSTS: not enabled until production HTTPS on all published hosts is accepted.

## Host routing (this repo)

| Host | App |
|---|---|
| apex | public `/` |
| `www` | 308 → apex |
| `cashier.` | `/` → `/cashier` |
| `admin.` | `/` → `/director` |
| `stage.` | public/staging container (`APP_ENV=staging`, noindex) |
| `owner.` | `/owner-unavailable` (not `/admin`) |
