# Yandex Cloud production audit

**Date:** 2026-09-08  
**Auditor:** local console + public DNS (read-only). No secrets, passwords, or Lockbox payloads.

Canonical product model: [`ECOSYSTEM.md`](./ECOSYSTEM.md).  
This file records **what actually exists**, not the target diagram.

## 1. Organization / folders

| Item | Value |
|---|---|
| Cloud | `cloud-elenastepankova70` / `b1gspm3s0tpj12sh6l9t` |
| Production folder | `lemuria-production` / `b1g6627fmdlm7ms0eah1` |
| Staging folder | `lemuria-staging` / `b1gpfp37hftb0vfqsdl6` |
| Extra folder | `default` / `b1gqd5eem9n6ovjvpt3u` (not used by Lemuria app) |

**Deviation from ECOSYSTEM:** apps, registry, Lockbox, PostgreSQL cluster object, buckets, and API Gateways live in **`lemuria-production`**. VPC that the cluster is attached to lives in **`lemuria-staging`**. Staging is not a second Managed PostgreSQL — it is a second database on the same cluster (cheaper, weaker isolation).

## 2. VPC / subnets / security groups

### Folder `lemuria-production`

No cloud network. Empty VPC UI («создайте первую сеть»).

### Folder `lemuria-staging`

| Resource | ID / value |
|---|---|
| Network | `default` / `enpn9ij06au0kbqtvd6j` |
| Subnet `ru-central1-a` | `default-ru-central1-a` / `e9bg1i5qqp7jqga39gv2` / `10.128.0.0/24` |
| Subnet `ru-central1-b` | `default-ru-central1-b` / `e2lgriqcsk0gdmh74e6k` / `10.129.0.0/24` |
| Subnet `ru-central1-d` | `default-ru-central1-d` / `fl84rh7son1r4eql29lm` / `10.130.0.0/24` |
| Subnet `ru-central1-e` | `default-ru-central1-e` / `ajcvhjtm1gto9oaah511` / `10.131.0.0/24` |
| Default SG | `default-sg-enpn9ij06au0kbqtvd6j` / `enphb90hav16jumrq4lj` |
| Public IPs | none reserved |

Default SG inbound: `0.0.0.0/0` / Any / all ports.  
Default SG outbound: `0.0.0.0/0` / Any / all ports.

PostgreSQL **public access is OFF**, so the cluster has no public address. Traffic still depends on this default SG for anything else placed in the network. Tightening SG is a hardening task; do not open `0.0.0.0/0` on the PG host.

## 3. PostgreSQL

| Field | Value |
|---|---|
| Name | `lemuria-production-db` |
| ID | `c9qr050d8me6ov341cbs` |
| Status | Alive |
| Environment | PRODUCTION |
| Version | 17 |
| Host class | `s3-c2-m8` (2 vCPU, 8 GB RAM) |
| Disk | 20 GB network-ssd |
| Autoscale disk | up to 200 GB (cost risk) |
| Hosts | 1, zone `ru-central1-a`, role MASTER, public access **Нет** |
| Host name (console) | `rc1a-mak0v9br261idkju` |
| FQDN (official suffix) | `rc1a-mak0v9br261idkju.mdb.yandexcloud.net` |
| Port | **6432** (Managed PostgreSQL / project `.env.example`; SSL required) |
| Network | `default` in folder `lemuria-staging` |
| HA | No |
| Deletion protection | Yes |
| Backups | automatic daily ~22:00 UTC, retain 7 days; copies present 01–07.09.2026 |
| Console estimate | **5 941,44 ₽ / month** |
| WebSQL | enabled |

### Databases / owners (no passwords)

| Database | Owner |
|---|---|
| `db1` | `user1` (legacy cluster default — do not rename) |
| `lemuria` | `lemuria_app` |
| `lemuria_staging` | `lemuria_staging_app` |

Connection limits: 50 per user. Auth: SCRAM-SHA-256.

**Do not** enable public access. **Do not** add a second host or change class without a cost STOP (that exceeds the 1 000 ₽ confirmation threshold).

## 4. Service accounts (folder `lemuria-production`)

Seven accounts. Folder-level role column in the list UI showed «—» (roles are likely resource-scoped: Lockbox, container invoke, registry push). Do not grant `admin`/`editor` on the cloud.

| Name | Last auth (console) | Notes |
|---|---|---|
| `lemuria-image-builder` | 2026-09-08 | registry push |
| `lemuria-app-staging` | 2026-09-08 | staging runtime; id `ajeso0bmhorsanakvv8q` |
| `lemuria-gateway-invoker` | 2026-09-08 | staging GW invoke; id `ajeef9jhq9po31s1c7t1` |
| `lemuria-staging-cron` | 2026-09-08 | timer → staging container |
| `lemuria-app-production` | 2026-09-01 | production runtime |
| `lemuria-production-gateway` | 2026-09-01 | description: production API Gateway invoker; GW spec uses `aje721vvq18773hkbu7f` |
| `lemuria-production-cron` | never | description: «no timer yet» |

Personal user is **not** the runtime identity. Builder JSON key stays outside git (`.yc-keys/`, dockerignore).

## 5. Container Registry

| Field | Value |
|---|---|
| Name | `lemuria-registry` |
| ID | `crprmg5vv1ubl0u4fpad` |
| Status | Active |
| Size | 3.22 GB |
| Auto scan | not configured |
| Image repo in use | `cr.yandex/crprmg5vv1ubl0u4fpad/lemuria-app` |

Do **not** retag `:latest` as the only pointer. Staging currently uses digest tags.

## 6. Serverless Containers

Scale-to-zero (0 provisioned instances), 1 vCPU / 20% / 1 GB RAM, concurrency 1. Direct URLs require IAM (HTTP 403 without token) — keep it that way.

### Staging `lemuria-app-staging`

| Field | Value |
|---|---|
| ID | `bba8dkct9jn9885jcd6n` |
| Active revision | `bba606jd194cv07a4pmo` (2026-09-08) |
| Image digest | `sha256:c2cc7f757af4ef4afdb06da021e9d2297556acff06053c4da29c87b958097810` |
| Git SHA (`/api/health/live`) | `a229b42` |
| Rollback revision | `bbaf4pakilqmk2kj92ri` / `sha256:44a4c91b…` / `b8c354f` |
| Direct URL | `https://bba8dkct9jn9885jcd6n.containers.yandexcloud.net/` (403) |
| Cron | timer `lemuria-staging-cleanup` / `a1ssem79grugn9870s0g` hourly |

Staging env (revision form, 2026-09-08): `APP_ENV=staging`, `RUN_MIGRATE_ON_START=0`, `RUN_STAGING_SEED_ON_START=0`, `ALLOW_STAGING_SEED=0`, `NODE_ENV=production`, `PRISMA_CONNECTION_LIMIT=1`.

### Production `lemuria-app-production`

| Field | Value |
|---|---|
| ID | `bbaqa5r6njb9nrqhaohq` |
| Description | Lemuria Park production runtime (no migrate on start) |
| Active revision | `bba168v26u59ckgqj0cs` (2026-09-01) |
| Image digest | `sha256:855518d59d7ec9c115e00d498ab759b9603de598c873e423ae1c7740757c9253` |
| Git SHA via temp GW | `0f2c555` |
| Direct URL | `https://bbaqa5r6njb9nrqhaohq.containers.yandexcloud.net/` (403) |

**This audit did not create a production revision.** Production is an older image than staging.

## 7. API Gateway

| Name | ID | Service domain | Container |
|---|---|---|---|
| `lemuria-staging-gw` | `d5d9sorlbdsebnpfr97f` | `https://d5d9sorlbdsebnpfr97f.0ly8ed4d.apigw.yandexcloud.net` | `bba8dkct9jn9885jcd6n` |
| `lemuria-production-gw-temp` | `d5dt6slu3sr4tpmalbta` | `https://d5dt6slu3sr4tpmalbta.0ly8ed4d.apigw.yandexcloud.net` | `bbaqa5r6njb9nrqhaohq` |

Custom domains: none (Certificate Manager empty). Production GW description: «Temporary production Gateway without DNS».

Health (2026-09-08):

- Staging `/api/health/live` → `ok`, `sha: a229b42`; `/ready` 200, database ok  
- Production temp GW `/api/health/live` → `ok`, `sha: 0f2c555`; `/ready` 200, database ok  

## 8. Object Storage

| Bucket | Objects | ACL |
|---|---|---|
| `lemuria-production-files-b1g6627f` | 0 / 50 GB | authorized only |
| `lemuria-staging-files-b1gpfp37` | 0 / 50 GB | authorized only |

Listing is not public. CMS media is not in the bucket yet (0 objects). Do not create a second production bucket unless renaming is required; the playbook name `lemuria-production-media` is unused.

## 9. DNS

- Folder `lemuria-production`: public zone `lemuria-idn-public` / `dnsc1mtn8giolgemiiar` for `xn--80akjgfhqje3a8k.xn--p1ai.` — **not live** (registrar still Tilda). See [`dns-before-cutover.md`](./dns-before-cutover.md).  
- Folder `lemuria-staging`: dashboard counts 3 zones / 9 records — UI lists them as **service zones** (VPC internal), not `lemuriapark.ru`.  
- Public resolver `77.88.8.8`: **`lemuriapark.ru` NXDOMAIN**. No A/MX/TXT/NS. Subdomains `cashier` / `admin` / `owner` / `www` / `stage` also empty.

See [`dns-before-production.md`](./dns-before-production.md). **No DNS cutover in this pass.**

## 10. Certificates

Certificate Manager in `lemuria-production`: empty. HTTPS today is only API Gateway default `*.apigw.yandexcloud.net`. Cashier camera on custom host needs a real certificate after the domain exists.

## 11. Postbox

Cloud Postbox identities: **none**. Application must keep `EMAIL_PROVIDER=none` (honest: not «sent»).

## 12. Lockbox (names only)

| Name | ID | Notes |
|---|---|---|
| `lemuria-staging-secrets` | `e6qbnied6res79n7pe81` | staging runtime |
| `lemuria-production-secrets` | `e6qhqn6f3ggc6s2anq8u` | |
| `lemuria-production-app-secrets` | `e6qkhu3pta0cujgeeanh` | |
| `lemuria-prod-runtime` | `e6qs2d9lf1skf7s89huj` | |
| `lemuria-staging-staff` | `e6qjfb8flafq1081p2md` | staging staff password only |
| `connection-a59gnfp4bva028jcfekm` | `e6qsa81b88g6qaeurhqd` | MetaData Hub / WebSQL |
| `connection-a59tjs83a0sbr50dpkqu` | `e6q71jrs8caq8dhie9kf` | MetaData Hub |
| `connection-a59bc9j30v321598ffg7` | `e6q2cjvd4ov56fskf9gv` | MetaData Hub |

Values were **not** opened.

## 13. Logging / monitoring / cron

| Resource | ID / value |
|---|---|
| Log group | `default` / `e234lk2ac6uj4e6eps1f`, retain 3 days |
| Staging cleanup timer | `lemuria-staging-cleanup` / `a1ssem79grugn9870s0g` / `0 * ? * * *` |
| Production cron | SA exists, **no timer** |
| Monium | not configured (console suggests migrating from Cloud Logging) |

PostgreSQL monitoring is built-in (CPU/RAM/disk on host: 13% / 9% / 1% at audit time).

## 14. YooKassa

Not a Yandex Cloud resource. Production shop credentials were **not** added in this pass. Online PAID must stay honest until webhook + keys exist.

## 15. Repo vs cloud

| Expected in playbook | Status |
|---|---|
| `docs/deployment.md` | missing before this branch — added as index |
| `docs/security.md` | missing before this branch — added as index |
| Dockerfile standalone | yes (`DOCKER_BUILD=1`) |
| `.dockerignore` secrets/git/tests | yes |
| Health `/live` `/ready` | yes |
| Host routing | `product-hosts.ts`: `admin.*` → director, `owner.*` → `/admin` (not a finished Owner product) |

## 16. Hard stops (not done here)

- Production container revision / image promote  
- `prisma migrate deploy` on database `lemuria`  
- DNS / certificates / Postbox  
- Enable PG public IP, second host, class change, Kubernetes, Compute VM  
- Merge to `main`  
- Billing account change  
