# Security

Implementation notes: [`security-audit-result.md`](./security-audit-result.md).  
Runtime incidents: [`operations-runbook.md`](./operations-runbook.md).  
Cloud inventory: [`yandex-production-audit.md`](./yandex-production-audit.md).

## Non-negotiable

- Managed PostgreSQL public access **OFF**. No `0.0.0.0/0` on the database address.  
- No `.env`, Lockbox payloads, or builder keys in git or in the Docker image.  
- No production seed, no `ChangeMe123!` in production.  
- Online order becomes `PAID` only after a verified YooKassa webhook (or cashier cash/card path).  
- Email UI says «sent» only after Postbox success.  
- QR is accepted only through check-in domain rules (no fake SUCCESS).  
- Refunds are audited; success is not faked.  
- Staff hosts are `noindex`. Cookies httpOnly. RBAC on the server.

## Secrets

`AUTH_SECRET`, `QR_SIGNING_SECRET`, `CRON_SECRET`, DB password: Lockbox → container env. ≥32 random bytes. Never print in docs or chat.

`CRON_SECRET` authenticates timer invocations. Staging timer exists; production timer does not yet.

## Network

Application Serverless Containers must stay on the VPC that can reach `lemuria-production-db` (today: `default` in folder `lemuria-staging`). Production folder has no VPC of its own — do not «fix» that by giving PostgreSQL a public IP.

Default security group is currently wide (`0.0.0.0/0` any). Harden later without breaking Serverless → PG. Do not open public PG to compensate.

## Hosts

| Host | Product | Code |
|---|---|---|
| `lemuriapark.ru` | Public | `/` |
| `cashier.lemuriapark.ru` | Cashier | `/cashier` |
| `admin.lemuriapark.ru` | Director | `/director` |
| `owner.lemuriapark.ru` | Owner | not a finished product; see [`owner-product-plan.md`](./owner-product-plan.md) |

`ALLOWED_HOSTS` is required in production. Health probes are exempt.
