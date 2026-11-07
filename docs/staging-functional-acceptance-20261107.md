# Staging acceptance, 7 November 2026

The deployed staging image matched production digest `sha256:1a99b528b4ab755889c057b06c65ca68316545aa7bcbdd990740ba39acce0587`.

Completed on the actual staging HTTP API using separate synthetic accounts, normal password verification and issued sessions (no signed-cookie injection): CASHIER, ADMIN, DIRECTOR and OWNER login, identity and finance permission cases. These are API acceptance tests, not independent interactive browser sign-ins by each employee.

Eight QR API cases passed: valid SUCCESS; repeated and pre-used ALREADY_USED; WRONG_DATE; WRONG_LOCATION; CANCELLED; REFUNDED; unknown INVALID. A new synthetic shift and zero-value synthetic orders/tickets were used. Afterwards the synthetic accounts were disabled, their sessions deleted, tickets/orders cancelled and the test shift closed. Production sales, accounts, shifts and payments were unchanged. The existing IAM-only audit container was restored to its prior image/configuration and restoration was verified.

ONLINE_MANAGER was sent the unverified portal value `online` and returned HTTP 400. This is an unresolved test-contract issue, not established proof of an application defect. A follow-up worker adds contract inspection, QR image encode/decode and concurrent-entry tests. Its first rebuild stopped on an existing temporary directory before deploying; the helper is corrected, but these added tests have not yet run. Do not report them as passed.

Browser layout was exercised at an actual CSS viewport width of 340px using standard Chrome zoom. Page and login form had no horizontal overflow. The menu opened/closed; ticket navigation, choosing 20:30, adult/child increment and totals worked (1100 then 2100 roubles). Child-only selection disabled payment and showed the accompaniment requirement. Staging rejected promo «ВЫГОДА» with a normal business-rule message. No browser booking/reservation/payment was submitted. This is responsive-layout testing, not physical iOS/Android, touch keyboard or camera acceptance.

The staging revision has no payment-provider shop/key environment variables or secret bindings. No verified test merchant was available; actual provider sandbox payment, refund, webhook and receipt flows remain untested. No production payment configuration was changed. No automatic financial operation ran.
