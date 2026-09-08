# DNS snapshot before production cutover

**Captured:** 2026-09-08, resolver `77.88.8.8` (Yandex).  
**Action:** read-only. No records created, updated, or deleted.

## Public zone `lemuriapark.ru`

| Query | Result |
|---|---|
| NS | NXDOMAIN (SOA `ru.` / `a.dns.ripn.net`) |
| A / AAAA | empty |
| MX | empty |
| TXT (SPF/DKIM/DMARC/verification) | empty |
| SOA for the name | none (name does not exist) |

Subnames checked (all empty / NXDOMAIN):

- `www.lemuriapark.ru`
- `cashier.lemuriapark.ru`
- `admin.lemuriapark.ru`
- `owner.lemuriapark.ru`
- `stage.lemuriapark.ru`

There is **no existing mail** on this name to preserve, because the name is not delegated. The risk of a future cutover is different: **registering** the domain and then attaching Cloud DNS / registrar NS. After purchase, re-run this snapshot immediately (MX/TXT often appear from the registrar or mail vendor).

## Yandex Cloud DNS

| Folder | Public zones | Notes |
|---|---|---|
| `lemuria-production` (`b1g6627fmdlm7ms0eah1`) | 0 | empty Cloud DNS |
| `lemuria-staging` (`b1gpfp37hftb0vfqsdl6`) | 0 public; 3 **service** zones / 9 records | VPC internal, not `lemuriapark.ru` |

Do not delete service zones. They are not the public site.

## Current HTTPS fronts (not custom DNS)

| Role | URL |
|---|---|
| Staging app | `https://d5d9sorlbdsebnpfr97f.0ly8ed4d.apigw.yandexcloud.net` |
| Production temp GW | `https://d5dt6slu3sr4tpmalbta.0ly8ed4d.apigw.yandexcloud.net` |

## Cutover rules (when the domain exists)

1. Re-snapshot NS/MX/TXT.  
2. Never drop MX/TXT/SPF/DKIM/verification.  
3. Certificates in Certificate Manager **before** pointing A/ANAME at API Gateway.  
4. HSTS only after all four product hosts answer on HTTPS.  
5. `owner.lemuriapark.ru` must not be advertised as a finished Owner product while `/admin` is the technical console — maintenance page or leave DNS unset ([`owner-product-plan.md`](./owner-product-plan.md)).

**STOP:** domain registration, NS change, and Gateway custom-domain attach need explicit user confirmation (DNS cutover).
