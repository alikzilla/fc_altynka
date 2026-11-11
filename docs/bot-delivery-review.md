# Bot delivery implementation review

Approved direction: docs/bot-copy-draft.md. Group announcements and opt-in personal tasks implemented on the existing per-event EventSync durable queue.

## Behavior

- Group: one editable signup, compact bill with payer progress, published teams, brief schedule/cancellation announcements. Changing a schedule carries previous details; identical saves produce no announcement.
- Private: movement for the affected participant (inviter for a guest), own bill amount and changed payment details, manual reminders. Every private delivery checks current membership, preference and reachability. Removed members do not enter group fallback.
- Preference defaults off. Receiving a private update or signed allows_write_to_pm proves reachability; neither subscribes automatically. /settings toggle or profile action is explicit consent. A Telegram 403 makes the destination unavailable while retaining the preference.
- Private payment buttons contain the bill, outstanding amount, receiver ID and Kaspi destination snapshot. Marking paid checks the sender's own current line and makes a conditional SQL update. Changed amount/destination requires opening the current payment. These are user marks, not banking confirmation.
- Superseded payment/reminder controls are removed before replacing their stored message ID. Paid/closed states update existing personal messages, without sending fresh demands. Closed unpaid bills say the organizer closed the bill.
- Manual reminders: one per recipient/event per 24h; only private-unreachable current members appear in one group fallback. Report exposes queued/complete/retrying and recipient totals, persisted across retries. New requests inside the cooldown report skipped delivery.
- Network failures retain work and do not block independent recipients. 429 pauses further Telegram calls until retry_after. A service crash after Telegram accepted a send but before durable acknowledgement can still cause a duplicate: Telegram sendMessage provides no idempotency key.
- Match records retain their Telegram group ID. A legitimate group→supergroup migration updates this snapshot; rebinding to a different group cannot route old queued work into the new group.
- Commands: /start, /matches, /payments, /settings, /help; /newmatch for organizers; /bind remains owner-only. Data commands check current membership; menu visibility is not authorization. Group personal commands redirect to private chat.
- Name, short/long description and scoped command menus are managed by scripts/bot-profile.mjs. Avatar remains the existing asset pending approval of an actual club mark. No webhook reset or synthetic group/private test messages are required.

## Verification

- Full suite: core 24, miniapp 94, worker 164 tests passed.
- Connector/profile configuration: 9 Node tests passed.
- Browser suite: 40 scenarios passed in the combined run; the remaining payment scenario expected the superseded toast. After its assertion was updated to the approved copy it passed separately. Includes Chromium, WebKit input checks and narrow profile/reminder views with axe.
- Typecheck, production build, Worker deploy dry-run, git diff --check passed.
- Review findings reproduced by regression tests and fixed: changed Kaspi destination, retired private controls, stopping after 429, suppressing removed-member fallback. Additional tests cover retry report totals and previous-group isolation.
- Physical Telegram iOS/Android permission popup, notifications and push delivery require an actual user/device. Local tests replace Telegram with a transport fake; no real recipients were contacted for testing.

## Rollout

Target: Worker fc-altynka, D1 fc-altynka, bot @fc_altynka_bot, Mini App fc_altynka_app. Existing Cloudflare secrets BOT_TOKEN and WEBHOOK_SECRET are present; values never enter logs.

1. Apply additive migrations 0004_cultured_triton.sql (off-by-default preferences) and 0005_luxuriant_prodigy.sql (group snapshot/backfill) with project-local Wrangler.
2. Deploy the verified Worker plus Mini App assets. Existing requested app/UX changes are in this build.
3. Apply `node scripts/bot-profile.mjs --apply` to the approved metadata; script has a credential-free dry-run by default.
4. Read health, webhook, profile/menu and scoped commands; verify migrations and new columns. Do not create matches or send synthetic messages into the real group.

Rollout completed: both additive migrations applied, Worker version `610736a1-9e10-4e74-b7d9-3d374f46d2df` deployed, profile metadata script applied successfully. One match was created through the previous Worker during the migration window; its previously-null group snapshot was backfilled after deployment. Existing match data was retained. Existing personal subscriptions remain off until each player enables them.

2026-11-05: the default private /start welcome now uses «ФК Алтынка» and exactly one «Открыть приложение» button pointing to the Mini App home. Existing settings/payment deep links and subscription behavior remain available. Verified 23 bot tests, Worker typecheck and diff check. Published as `df11de9d-10f9-41a7-a57e-fcb344f74594` without synthetic Telegram sends.

2026-11-11: личный чат стал рабочим экраном. `/start` показывает ближайший матч, место в очереди, сумму к оплате и состояние уведомлений; запись и отмена работают кнопкой в личном сообщении (`mj:`/`ml:`; группа берётся из матча, членство подтверждает Telegram). Кнопки меню перерисовывают то же сообщение, текст без команды открывает меню. Добавлены личные уведомления подписчикам: открыта запись на новый матч (всем подписанным участникам группы, кроме создателя, порциями по 12 за один alarm), назначение и изменение времени или поля, отмена матча, публикация составов с командой получателя. В группе эти события не дублируются сверх прежних объявлений. Подписка по-прежнему выключена по умолчанию. Миграций нет. Проверено: worker 367 тестов, connector/profile/channel 15 тестов, typecheck. Реальные сообщения не отправлялись; публикация Worker и проверка на устройстве не выполнялись.
