# DNS snapshot before cutover — парклемурия.рф

**Captured:** 2026-09-08  
**Resolvers:** `77.88.8.8` and authoritative `ns1.tildadns.com`  
**Punycode:** `xn--80akjgfhqje3a8k.xn--p1ai` ([`idn-domain.md`](./idn-domain.md))

**No records were changed at the registrar or at Tilda.**

## Registration

| Field | Value |
|---|---|
| Unicode | парклемурия.рф |
| ASCII | `XN--80AKJGFHQJE3A8K.XN--P1AI` |
| State | REGISTERED, DELEGATED, VERIFIED |
| Registrar | **REGRU-RF** (REG.RU), admin-contact https://www.reg.ru/whois/admin_contact |
| Person | Private Person (whois) |
| Created | 2026-02-12T13:49:50Z |
| Paid till | 2027-02-12T13:49:50Z |
| Free-date | 2027-03-15 |
| Source | TCI whois |

## Current DNS provider

**Tilda DNS** — not Yandex Cloud DNS, not REG.RU hosting DNS.

NS (TTL 7200):

- `ns1.tildadns.com.`
- `ns2.tildadns.com.`

SOA: `ns1.tildadns.com. ns.tilda.team. 2026021204 10800 7200 1209600 7200`

Live site: HTTPS 200, `x-tilda-server`, title «Лемурия Парк. Выберите город», A `176.57.66.139`, DDoS-Guard cookies on **`.xn--80akjgfhqje3a8k.xn--p1ai`**. Cutover **replaces this Tilda site**.

## Record inventory

| Name | Type | TTL | Value |
|---|---|---|---|
| `@` / apex | NS | 7200 | ns1/ns2.tildadns.com |
| `@` | A | 900 | `176.57.66.139` |
| `@` | AAAA | — | **none** |
| `@` | MX | — | **none** |
| `@` | TXT / SPF | — | **none** |
| `@` | CAA | — | **none** |
| `www` | CNAME | 900 | apex (`xn--80akjgfhqje3a8k.xn--p1ai`) |
| `cashier` | A/CNAME | — | **none** |
| `admin` | A/CNAME | — | **none** |
| `owner` | A/CNAME | — | **none** |
| `stage` | A/CNAME | — | **none** |
| `_dmarc` | TXT | — | **none** |
| `default._domainkey` / `mail._domainkey` | TXT | — | **none** |
| `_acme-challenge` | TXT | — | **none** |
| `_yandex` / yandex-verification | TXT | — | **none** |

There is **no mail** to preserve today (no MX/SPF/DKIM/DMARC). After Postbox, those TXT/CNAME must be added **before** or **with** cutover — do not drop them later.

## Yandex Cloud DNS zone (prepared, not authoritative)

Created 2026-09-08 in folder `lemuria-production`. **Registrar NS still Tilda.** This zone does not answer public queries until cutover.

| Field | Value |
|---|---|
| Name | `lemuria-idn-public` |
| ID | `dnsc1mtn8giolgemiiar` |
| Zone | `xn--80akjgfhqje3a8k.xn--p1ai.` |
| Type | Public |
| Console estimate | ~141 ₽/мес (зона 42,62 ₽ + оценка запросов) |
| NS (Yandex) | `ns1.yandexcloud.net.` · `ns2.yandexcloud.net.` |
| Current records | apex NS + SOA only |

Do **not** change REG.RU NS to these until `разрешаю DNS cutover`.

Planned data (after Gateway custom domains + certificates exist):

| Name | Type | Target |
|---|---|---|
| `@` | ANAME/ALIAS (or A from Gateway) | production API Gateway `d5dt6slu3sr4tpmalbta.0ly8ed4d.apigw.yandexcloud.net` |
| `www` | CNAME | apex |
| `cashier` | CNAME | production API Gateway service domain |
| `admin` | CNAME | production API Gateway service domain |
| `stage` | CNAME | staging API Gateway `d5d9sorlbdsebnpfr97f.0ly8ed4d.apigw.yandexcloud.net` |
| `owner` | — | **omit** |

Exact CNAME/ANAME values must match Certificate Manager + API Gateway «custom domain» UI after those resources exist. Do not copy IPs from Tilda (`176.57.66.139`) into Yandex.

## Cutover STOP

Wait for: `разрешаю DNS cutover`.

Then show: current NS (Tilda) vs new NS (Yandex), this snapshot vs new records, cert status, Gateway domains, TTL (Tilda A 900s / NS 7200s), rollback = restore Tilda NS at REG.RU.

Rollback window: NS TTL 7200s (~2h) plus resolver cache.
