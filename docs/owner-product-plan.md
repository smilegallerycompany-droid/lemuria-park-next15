# Owner product plan

**Status:** `/admin` is a **technical OWNER/ADMIN console**, not the finished `owner.lemuriapark.ru` product.  
Do not point public marketing or NS `owner.*` at it as if it were done.

Canonical split: [`ECOSYSTEM.md`](./ECOSYSTEM.md) §1 and §4.

## What `/admin` already has

From `AdminLayoutClient` (label «Управляющий»):

| Route | Intent |
|---|---|
| `/admin` | Overview / KPIs |
| `/admin/analytics` | Cross-location numbers |
| `/admin/locations` | All locations |
| `/admin/users` | Users / roles |
| `/admin/orders` | Orders |
| `/admin/payments` | Payments list + detail |
| `/admin/tickets` | Tickets |
| `/admin/shifts` | Shifts |
| `/admin/integrations` | Honest integration status (YooKassa / mail / storage) |
| `/admin/system` | Component health |
| `/admin/audit` | Audit log |
| `/admin/settings` | Global settings |

This overlaps director operational screens more than an executive Owner dashboard. Hostname rule in `product-hosts.ts`: `owner.*` currently rewrites `/` → `/admin`. That is a **temporary** host mapping, not product sign-off.

## Owner must eventually see

- Revenue by city / location comparison  
- Directors and assignments  
- System health (already sketched in `/admin/system`)  
- Payments and provider honesty  
- Integrations  
- Audit  
- Global settings  

Without copying cashier UX or stuffing director charts into Owner.

## Launch rule

Public + cashier + director can go live **without** Owner DNS.

Until Owner is signed off:

- leave `owner.lemuriapark.ru` unset, **or**  
- serve a maintenance / «не готово» page — never present `/admin` as the Owner product.

Public visual SOT stays `lemuriapark.ru` / `lemuria-awwwards-frontend`. Do not turn that repo into admin.
