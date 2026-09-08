# Production cost estimate (Yandex Cloud)

**Date:** 2026-09-08  
**Budget cap:** ~10 000 ₽ / month all-in.  
**Must not exceed without STOP:** normal month > 10 000 ₽, or any **new** line > 1 000 ₽ / month.

Sources: Managed PostgreSQL console tariff line; other services are usage-based with empty/low traffic today. Not a billing-account invoice (billing UI was not opened).

## Existing (do not recreate)

| Line | Typical month | Notes |
|---|---|---|
| Managed PostgreSQL `s3-c2-m8` + 20 GB network-ssd | **5 941 ₽** | Console figure on cluster `c9qr050d8me6ov341cbs`. Dominates the budget. |
| Disk autoscale to 200 GB | **risk** | If triggered, SSD storage alone can add thousands of ₽. Keep growth watched. |
| Serverless Containers ×2 (0 provisioned) | ~100–800 ₽ | Scale to zero. Staging + production. Avoid reserved instances. |
| API Gateway ×2 | ~50–400 ₽ | Traffic-shaped. Custom domains later: still cheap vs PG. |
| Container Registry 3.22 GB | ~50–150 ₽ | Storage of images. |
| Object Storage 0 objects / 50 GB quota | ~0–100 ₽ | Pay for stored GB + egress. |
| Lockbox (8 secrets) | ~0–50 ₽ | |
| Cloud Logging 3-day default group | ~0–200 ₽ | Raise retention only if needed. |
| Cloud DNS service zones | ~0 | No public zone yet. |
| Certificate Manager | 0 | Let’s Encrypt via YCM is not a VM cost. |
| Postbox | 0 | Not created. After setup: per-email, usually << PG. |
| Public IPv4 | 0 | None reserved. Do not add without need. |
| Kubernetes / extra VM | 0 | Forbidden by architecture. |

PostgreSQL leftover vs 10 000 ₽ cap: **~4 000 ₽** for app + storage + DNS + mail + logs + traffic.

## Scenarios

| Scenario | Estimate | Verdict |
|---|---|---|
| Minimum (current shape, low traffic, no custom DNS) | **~6 100 – 7 000 ₽** | Under cap |
| Normal month (custom HTTPS, some media, Postbox, staging+prod traffic of a small park) | **~6 500 – 8 500 ₽** | Under cap **if** PG disk stays 20 GB and no second PG host |
| High traffic month (many ticket images, gateway GB, logging) | **~8 000 – 12 000 ₽** | **STOP if > 10 000**. First cuts: log retention, unused images in registry, no provisioned container units, no second PG host |

## Do not buy (would break the cap or the 1 000 ₽ rule)

- Second PostgreSQL host (HA) — large monthly jump; requires confirmation.  
- Larger host class.  
- Kubernetes / Compute VM «for production».  
- Dedicated staging Managed PostgreSQL of the same class.  
- Reserved Serverless instances «to be safe».

## Staging strategy (already chosen)

Cheap staging: **same cluster**, database `lemuria_staging`, Serverless scale-to-zero, path/Gateway host instead of `stage.lemuriapark.ru`. This is the budget-safe option. A second PRODUCTION-class cluster would duplicate ~5 941 ₽ and is rejected unless the user explicitly accepts cost.

## Before production DNS cutover

Recompute this file after: domain price (registrar, often outside Yandex), Postbox, Certificate Manager, and any change to PG disk/class.
