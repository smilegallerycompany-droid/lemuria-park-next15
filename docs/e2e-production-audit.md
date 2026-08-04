# E2E production audit

Branch: `release/lemuria-production-hardening`  
Credentials (seed / non-production only): `owner@lemuriapark.ru` / `cashier@lemuriapark.ru` / `ChangeMe123!`  
Verification: Playwright `e2e/*` + Node concurrency suites + manual/API spot-checks.

## A. Онлайн-покупка

| Step | Expected | Actual | Defect | Fix | Test |
|------|----------|--------|--------|-----|------|
| Location | Active location from config | `moscow-vdnh` Krasnodar venue | — | — | `public-booking` + `/api/public/config` |
| Date | Future open weekdays only (Tue closed) | Date select skips Tuesday | — | — | Manual UI + config `closedWeekdays` |
| Session | Future bookable slots | SCHEDULED/OPEN listed | — | — | `/api/public/sessions` |
| Tickets | Adult/child qty | Qty steppers | — | — | Manual |
| Reservation | Holds seats, 15 min | Created ACTIVE | — | — | `public-booking` |
| Order | From reservation | Created | — | — | `public-booking` |
| Payment | Honest awaiting if YooKassa unset | `AWAITING_PAYMENT`, `paymentConfigured=false` | — | — | `public-booking` |
| Webhook | Idempotent PAID + tickets | Covered by concurrency + payments service | Double webhook risk | Idempotent apply | `payments.concurrency` |
| Success / QR | Tickets after PAID | Issued only after payment success | — | — | Unit + QR e2e |

## B. Офлайн-продажа (касса)

| Step | Expected | Actual | Defect | Fix | Test |
|------|----------|--------|--------|-----|------|
| Login | Cookie httpOnly session | Works | Secure cookie broke `next start` on HTTP | Secure only when `NEXT_PUBLIC_APP_URL` is HTTPS | `cashier-sale` |
| Cash sale | Order PAID, payment SUCCEEDED, tickets, seats ↓ | OK | — | — | `cashier-sale` |
| Card terminal | Same as cash with CARD_TERMINAL | Domain supports | — | — | Unit/cashier service |
| Director sees order | In orders list | OK after PAID | — | — | Manual / API |
| Analytics | PAID only counted | AWAITING excluded | — | Analytics PAID filter | `analytics.test` |

## C. QR check-in

| Scenario | Expected | Actual | Defect | Fix | Test |
|----------|----------|--------|--------|-----|------|
| Valid ticket | SUCCESS | SUCCESS | Race double SUCCESS | Transaction + unique SUCCESS path | `qr-checkin`, `check-in.concurrency` |
| Repeat scan | ALREADY_USED | ALREADY_USED | — | — | `qr-checkin` |
| Wrong date / location | Rejected | Domain rejects | — | — | Domain/check-in unit |
| Cancelled / refunded | Rejected | Rejected | — | — | Domain |
| Unknown QR | Not found | Not found | — | — | Domain |
| USB wedge / camera | Same API token path | Cashier scan UI | — | — | Manual UX |

## D. Директор

| Action | Expected | Actual | Defect | Fix | Test |
|--------|----------|--------|--------|-----|------|
| Locations CRUD | OK | OK | — | — | Manual |
| Schedule + generate | Sessions created | OK | — | — | Manual |
| Close day / session | CLOSED | OK for empty | — | — | `director-schedule` |
| Extra session / capacity / prices | OK; prices snapshot on order | Future price change keeps old `unitPrice` | — | — | `director-pricing` |
| Staff create / disable | Disable blocks login | OK | — | — | `rbac` |
| Analytics / audit | PAID metrics; sanitized audit | OK | Secrets in audit risk | `sanitizeAuditJson` | `security-audit-result` |
| Cancel/delete paid session | Forbidden | Was possible | **SESSION_HAS_PAID_ORDERS** | PATCH/DELETE guard 409 | `director-schedule` |

## E. Конфликтные сценарии

| Scenario | Expected | Actual | Defect | Fix | Test |
|----------|----------|--------|--------|-----|------|
| Two online on last 2 seats | No oversell | Capacity never negative | Write conflicts retried | Tx + seat lock | `reservations.concurrency` |
| Online + cashier last seats | No oversell | OK | — | — | `reservations.concurrency` |
| Price change mid-checkout | Snapshot at order | Order items keep unitPrice | — | — | `director-pricing` |
| Close session w/ reservation | Block or expire hold | Close empty OK; paid blocked | Paid delete allowed | Guard | `director-schedule` |
| Close session w/ PAID | Refuse | 409 `SESSION_HAS_PAID_ORDERS` | Yes | Fixed | `director-schedule` |
| Double pay click | Idempotent order/payment | Idempotency keys | — | — | Public + cashier |
| Double webhook | One PAID, one ticket set | Deduped | — | — | `payments.concurrency` |
| Double cashier «Оплачено» | Same idempotency key → one sale | OK | — | — | `cashier-sales.concurrency` |
| Double check-in concurrent | One SUCCESS | One SUCCESS | Race | Fixed | `check-in.concurrency` |

## Automated coverage

| Spec | Scenarios |
|------|-----------|
| `e2e/public-booking.spec.ts` | Page load; reservation+order awaiting payment |
| `e2e/cashier-sale.spec.ts` | Login + cash sale + seats decrease |
| `e2e/qr-checkin.spec.ts` | SUCCESS → ALREADY_USED |
| `e2e/director-schedule.spec.ts` | Close empty; refuse paid cancel/delete |
| `e2e/director-pricing.spec.ts` | Future price does not rewrite order |
| `e2e/rbac.spec.ts` | 401 anon; cashier≠director; disabled login |

## How to re-run

```bash
npm run build
npx prisma db seed   # non-production only
npm run test:e2e:install
npm run test:e2e
npm test             # includes *.concurrency.test.ts
```

Server: Playwright starts `npx next start -p 3001` (or reuses an existing server on that port).
