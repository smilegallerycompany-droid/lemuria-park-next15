# Telegram online order reports — 4 November 2026

## Active configuration and evidence

Daily Telegram reporting is enabled. A real report for 2026-11-03 was delivered to the owner's private chat at 2026-11-04 12:45:04 UTC. Its zero orders, payments and refunds match the read-only production query for that date.

- Bot: `@lemuriapark_reports_bot`, ID `9226581371`.
- Display name: `Лемурия Парк - отчеты онлайн заказы`.
- Recipient: owner only, verified through the signed-in account's Saved Messages and a `/start` in this bot. The recipient ID is stored in the encrypted GitHub secret `LEMURIA_REPORT_CHAT_IDS`, never in this repository. Other users are not subscribed by `/start`.
- Schedule: `0 6 * * *` UTC, 09:00 Europe/Moscow, daily. GitHub scheduling is best effort; exact minute delivery is not guaranteed. First scheduled run after activation: 5 November 2026.
- Successful test: https://github.com/smilegallerycompany-droid/lemuria-park-next15/actions/runs/41831207394 (attempt 2, job `126580997668`, success). Safe log: `REPORT_DELIVERED date=2026-11-03 recipients=1`. The message was also observed in the owner's Telegram chat.
- Active workflow: `.github/workflows/daily-online-reports.yml` on `main`, activated at commit `ed4ef6433694e8987068f6cdd26585555fc0e9fd`. Its first release runs an inline copy of `scripts/telegram-report-external-client.py` without checking out or deploying the website.
- Repository variable `LEMURIA_REPORTING_ENABLED=true`; service account variable `LEMURIA_REPORT_SERVICE_ACCOUNT_ID=ajed29990muptaci32qt`.
- Bot key remains in Yandex Lockbox secret `lemuria-telegram-online-reports`, ID `e6qo0gctoaoatlf5rtct`. Corrected current version: `e6q6qvch10n1orokkteb`. No bot key is stored in GitHub or local source files.
- Private Yandex worker: `lemuria-online-reports`, ID `bbar83r32o43u8ipsbo3`, URL `https://bbar83r32o43u8ipsbo3.containers.yandexcloud.net/`.
- Worker source: `scripts/telegram-online-report.cjs`, diagnostic source commit `753ee08e1d7b9a241d5c03abf42fc2f163b1afef` on the release branch. It reuses the exact production image and generated Prisma client, in the existing private DB network. It does not start the website, run migrations or seed data. No Telegram key is injected into the worker.

At 2026-11-04 12:48 UTC, the public website, website database readiness, CRM login page and CRM database readiness all returned HTTP 200; both readiness responses reported `database: ok`. Production website revision remained `bbade818m89f6qe0u4a3`, image digest `sha256:da1b62ffa61ffd6a7b63cdc96776efc1556ba31e9a433294bf16870b02e079fe`, release `public-sessions-metrika-maps-20261101-4a294e13`. Reporting activation did not redeploy the website or change financial records.

The separate twice-daily health automation remains enabled around 08:00 and 20:00 Europe/Moscow, with reports in ChatGPT. It does not send Telegram health alerts.

## Report definition

Previous complete calendar day in `Europe/Saratov` (UTC+4). Only ONLINE orders and real RUB YooKassa CARD_ONLINE payments are included. Test-mode payments are excluded. Paid order count is distinct order IDs. Successful refunds are counted by completion day, including refunds of older orders; the original order need not still have PAID status. Money is calculated as integer kopecks. The report explicitly flags any fallback to record update time where a provider confirmation timestamp is unavailable.

The worker starts a READ ONLY transaction, checks that the database is `lemuria`, and returns aggregate counts/amounts only, without customer contact details. Three tests passed: complete local day boundaries, strict recipient allowlist, and money/refund arithmetic. Embedded workflow Python scripts and YAML schedule were validated locally.

## Approved access and processing

The user approved GitHub processing of the aggregate report and transient bot key access on 4 November 2026, before creating this integration.

Dedicated service account: `lemuria-github-reports` (`ajed29990muptaci32qt`). Federation: `ajecbls2isnd5hsnram8`.

- Issuer: `https://token.actions.githubusercontent.com`.
- Audience: `https://github.com/smilegallerycompany-droid`.
- Exact subject observed from the signed GitHub OIDC token: `repo:smilegallerycompany-droid@230834415/lemuria-park-next15@1311503609:ref:refs/heads/main`.
- The initial documentation-style subject without numeric IDs did not match GitHub's current format; that unused initial binding was replaced. Only the exact numeric owner/repository ID + main binding remains. The workflow also validates the exact issuer, audience and subject before exchanging credentials.

| Service account | Role | Resource |
| --- | --- | --- |
| Dedicated GitHub reporting account | `serverless.containers.invoker` | Only private report worker `bbar83r32o43u8ipsbo3` |
| Dedicated GitHub reporting account | `lockbox.payloadViewer` | Only bot secret `e6qo0gctoaoatlf5rtct` |

No direct database access, folder-wide role, public invocation, or long-lived Yandex key was granted to GitHub. OIDC grants short-lived tokens for each run. The bot key is read from Lockbox into process memory. No report artifacts, financial amounts, recipient IDs or unmasked credentials are logged by the sender. The sender verifies the key format and bot identity before sending to the single configured private recipient.

Earlier approved resource-scoped grants remain: existing `lemuria-app-production` (`ajefpq89h6ueo1bl0ec8`) has `lockbox.payloadViewer` on the bot secret, and existing `lemuria-production-cron` (`ajefikjc8cs9h3rhp531`) has `serverless.containers.invoker` on the report worker. Neither exposes the worker publicly. No Yandex daily report trigger was created.

## Resolved delivery blockers

Direct Telegram API connections from Yandex Cloud Shell, the VPC worker and a probe without VPC timed out on TCP 443. A separately authorized GitHub sender provides the working delivery route.

An initial Lockbox value contained extra copied characters. The value was corrected directly from the exact input field in the original BotFather creation message into a new current Lockbox version; the key was not rotated, exported to a plaintext file or committed. Telegram getMe, sendMessage and actual private delivery then succeeded. The sender now rejects a malformed key before contacting Telegram.

Initial failed tests did not send financial messages. The final successful test delivered one report to the owner. No customer bookings, payments or refunds were created for testing.

## Operations, limitations and rollback

- To pause all future report sends, set repository variable `LEMURIA_REPORTING_ENABLED=false` or disable the GitHub workflow. Re-enable only when the delivery route is healthy.
- The run is limited to five minutes, concurrent runs are serialized, and automatic send retries are not implemented. Persistent per-day deduplication is not implemented: a deliberate manual rerun after a successful send can send that day's report again.
- Future recipients must be explicitly authorized, then the sender's single-recipient restriction and encrypted allowlist updated. Do not auto-subscribe everyone who opens the bot.
- On delivery failure, the GitHub run fails with a safe stage/error code; it does not label the report delivered or fabricate sales figures.
- Rollback affects reporting only. No website redeploy or database rollback is required. Preserve orders, payments, tickets and refunds.
- Cloud Shell checkpoint: `/home/cloudshell-user/lemuria-telegram-report-20261104/`, including `github-oidc-resources.json`, `final-state.json`, source/deployment payloads with Lockbox references, and read-only preview evidence. No raw bot key or DB password was written into these checkpoint files.
