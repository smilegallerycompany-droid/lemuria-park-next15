# Telegram online order reports — 4 November 2026

## Confirmed configuration

- Bot: `@lemuriapark_reports_bot`, Telegram bot ID `9226581371`.
- Display name: `Лемурия Парк - отчеты онлайн заказы` (confirmed by BotFather).
- Destination: account owner only, verified through the signed-in account's Saved Messages ID and a `/start` in the new bot. No other subscribers.
- Token stored directly in Yandex Lockbox secret `lemuria-telegram-online-reports`, ID `e6qo0gctoaoatlf5rtct`. No token is in this repository.
- Private worker container `lemuria-online-reports`: `bbar83r32o43u8ipsbo3`.
- Worker uses the existing production image, its existing private network, and its existing DB password reference. It does not launch the website, run migrations, or seed data.
- Source: `scripts/telegram-online-report.cjs`, GitHub commit `5b41a700e4dd32d2adfb8b83d5ce5167d8c477eb`.
- Three tests passed: complete local day boundaries, strict recipient allowlist, money/refund arithmetic.
- A real read-only production preview for 2026-11-03 completed successfully: created orders 0; paid orders 0; payments 0 RUB; successful refunds 0; refund amount 0 RUB. These numbers describe that date only.

## Report definition

Previous complete calendar day in `Europe/Saratov`; proposed delivery at 09:00 Moscow time (`0 6 * * ? *` UTC timer). Only ONLINE orders and real RUB YooKassa CARD_ONLINE payments are included. Test-mode payments are excluded. Paid order count is distinct order IDs. Successful refunds are counted by completion day, including refunds of older orders; the original order need not still have PAID status. Money is calculated as integer kopecks. The report explicitly flags any fallback to record update time where a provider confirmation timestamp is unavailable.

The worker explicitly starts a READ ONLY transaction and checks that the database is `lemuria`. It returns only aggregate amounts/counts, with no customer contact details. New `/start` messages do not add recipients: future recipients must be added to the explicit `REPORT_CHAT_IDS` allowlist after authorization.

## Delivery blocked — timer not enabled

The bot's daily delivery and timer are NOT active. No Telegram financial report or test delivery was delivered successfully. After failed delivery tests the worker was restored to preview-only configuration without a bot token injected. The bot token remains in Lockbox.

The user approved the two narrowly scoped IAM permissions on 2026-11-04; both were granted:

| Existing service account | Role | Resource |
| --- | --- | --- |
| `lemuria-app-production` (`ajefpq89h6ueo1bl0ec8`) | `lockbox.payloadViewer` | Only new bot secret `e6qo0gctoaoatlf5rtct` |
| `lemuria-production-cron` (`ajefikjc8cs9h3rhp531`) | `serverless.containers.invoker` | Only private report worker `bbar83r32o43u8ipsbo3` |

Neither role would expose the worker publicly or grant folder-wide permissions. The existing app's credentials, database schema, customer orders, and payment integration remain unchanged.

Prepared configuration is in Cloud Shell at `/home/cloudshell-user/lemuria-telegram-report-20261104/`: `preview-payload.json`, `preview-result.json`, `container.json`, `activation-plan.json`, and `send-payload-pending-approval.json`. The JSON payloads contain Lockbox references, never token or DB password values.

Granting permissions and injecting the pinned bot secret completed, but a real send failed at the Telegram stage with `UND_ERR_CONNECT_TIMEOUT`. A separate probe without VPC, DB credentials, or bot credentials also timed out. The source DNS A record was independently verified. IPv4 Cloud Shell curl to api.telegram.org:443 timed out too. No daily cloud timer was created. A future working delivery route must pass an actual private delivery test before automatic scheduling. Timer execution itself is at-least-once: strict persistent deduplication is not implemented in this worker.

Cloud Shell could not reach Telegram's HTTP API (`Network is unreachable`); the worker's independent outgoing network path and Telegram delivery still need a real test. Do not mark delivery successful based on bot creation, READ ONLY preview, or the timer definition alone.

## Rollback

Pause the new timer to stop future reports. The separate worker and bot secret may be left inactive. No website redeploy or database rollback is required. Do not delete financial records or reset the database.


## Proposed external sender — requires additional authorization

Prepared (not enabled) files:

- `.github/workflows/daily-online-reports.yml`: manual dispatch only, default-disabled gate `LEMURIA_REPORTING_ENABLED`, no cron.
- `scripts/telegram-report-external-client.py`: calls the private report preview, reads the bot key from Lockbox into memory, verifies the bot identity, and sends only to the one configured private owner ID. It does not query PostgreSQL directly, create report artifacts, or print amounts, recipient IDs, tokens, or customer details.

Proposed execution: the existing `smilegallerycompany-droid/lemuria-park-next15` GitHub repository, on a GitHub-hosted runner. Proposed OIDC issuer `https://token.actions.githubusercontent.com`, audience `https://github.com/smilegallerycompany-droid`, exact subject `repo:smilegallerycompany-droid/lemuria-park-next15:ref:refs/heads/main`. A new dedicated service account would receive only `serverless.containers.invoker` on the report worker and `lockbox.payloadViewer` on the bot secret. No federation, new service account, external IAM grants, long-lived credential, GitHub recipient secret, or schedule has been created for this proposal.

The runner would process aggregate financial counts/amounts and the bot token transiently in memory; this changes the processing destination and trust boundary and needs explicit authorization. The token would remain stored in Lockbox. Intended delivery remains 09:00 Moscow for the previous complete Saratov day, owner only. GitHub schedule timing is best effort rather than guaranteed to the minute. Connectivity from the eventual GitHub runner still requires verification.
