# Bot delivery and copy implementation plan

> **For agentic workers:** Execute the independent copy/commands tasks with scoped ownership; integrate and verify delivery in the current workspace. No commits or deployment of unrelated existing work.

**Goal:** Implement approved group announcements, opt-in personal tasks, restrained copy and useful role-aware bot commands.
**Architecture:** Keep EventSync as the durable delivery queue per event. Persist per-recipient fingerprints/message IDs and reminder cooldown in its storage; persist explicit preference and Telegram reachability on users. Resolve current event/bill state at delivery and validate private callbacks against the sender's own current bill line. Commands and reproducible bot-profile configuration are separate from webhook registration.
**Tech Stack:** TypeScript, grammY, Cloudflare Durable Objects/D1, Drizzle, Hono, React, Vitest, Playwright.
**Spec:** docs/bot-copy-draft.md — approved by user “выглядит по идее хорошо, давай сделаем”.

## Global constraints

- Existing dirty branch stays intact; no blanket commits, resets or unrelated deploy.
- Russian copy, direct actions, no unverified claims that bank payment was received.
- Personal notifications default off. Telegram availability and user preference are separate.
- Guests' notices/payments belong to inviter. No personal financial data in group command replies.
- Network/429 retry; blocked bot stops personal retries; one failed recipient must not block others.
- Manual reminders no more than once per person/bill per 24 hours. No scheduled reminder campaign.
- Avatar remains existing until a visual replacement has been approved.

## Review focus

1. Stale private payment buttons after amount/receiver changes cannot mark a changed obligation.
2. Personal delivery to a removed group member, disabled subscription or previous group is skipped.
3. Concurrent request during an alarm, rate limits, per-recipient retry and deduplication do not lose work.
4. Empty/closed bills and manual closure with unpaid lines have truthful texts and inactive payment controls.
5. Late movement notices resolve actual queue and guests; reminder fallback does not mention people already reached in private.

### Task 1: Message rendering

Files: apps/worker/src/render/*; test/render/*; src/sync/billPart.ts, teamsPart.ts for link context only.
Interfaces: renderBillMessage accepts optional eventId and LinkEnv, renderTeamsMessage accepts optional eventId and LinkEnv. Existing callers remain supported. EventView retains its fields. Root owns personal renderers and scheduling-change data.
- [x] Add failing tests for compact group bill, closed unpaid wording, restrained event copy and named buttons.
- [x] Implement approved texts/HTML escaping and concrete deep links; update existing assertions as behavior changes.
- [x] Run render tests and report exact commands/results.

### Task 2: Private commands and bot profile

Files: new apps/worker/src/bot/private.ts, presentation.ts; scripts/bot-profile.mjs; corresponding bot/script tests. Root owns bot.ts wiring and callback fixes.
Interfaces: registerPrivateCommands(bot: Bot, env: Env, deps: BotDeps): void. User schema will provide notificationsEnabled:boolean, pmAvailable:boolean. root adds renderPersonalPayment separately; commands should query their own compact debt summaries and link to b<eventId>. miniAppLink supports params matches, payments, settings, newmatch, t<eventId> after root routing update.
- [x] Failing command tests for explicit opt-in, member-only private data, organizer-only newmatch, and safe group handling.
- [x] Implement /start /matches /payments /settings /help /newmatch; callback notify:1/0 in private only; role-aware command list setup; clear unknown-command help.
- [x] Add explicit --apply configuration script for name/descriptions/command scopes/menu, dry-run default, never change webhook or avatar; test config values, scope and no secret output.
- [x] Run scoped tests; report changes and integration requirements. Do not apply remote settings yourself.

### Task 3: Personal delivery and safe callback

Files: db/schema.ts, new migration, test setup, sync/EventSync.ts, new sync/personal.ts, render/personal.ts, telegram/client.ts, bot/bot.ts, domain/events.ts and sync notice types for changed schedule.
Interfaces: delivery helper receives Db, TgClient, Env, DurableObjectStorage, eventId and current requested work; returns undelivered work through existing Run handling. Personal fingerprints stored per event/recipient/kind, never in global mutable memory.
- [x] Add failing tests for disabled default, opted-in payment/moves, guests, changed bills, stale callbacks, blocked bot, 429/network, cooldown, closure and membership.
- [x] Add default-off preference/availability columns and preserve schema migration history.
- [x] Integrate state-resolved delivery, grouped fallback for unavailable recipients, stable edit state and explicit private callback checks.
- [x] Suppress no-op schedule announcements; carry previous schedule into changed-detail notices.
- [x] Run worker suite and typecheck; verify no queued work lost while another request arrives.

### Task 4: Miniapp preferences and links

Files: core/api.ts, auth/initData.ts/middleware.ts, api/members.ts; miniapp/tg.ts, screens/Profile.tsx, startParam.ts and tests.
Interfaces: MeDto.notifications?: {enabled:boolean; available:boolean}; PATCH /api/me accepts notificationsEnabled only; availability derives from signed initData allows_write_to_pm or bot updates, never arbitrary client boolean. Opt-in in unsupported client links to bot settings in Telegram.
- [x] Failing tests for signed permission, truthful preference state and all new deep links.
- [x] Implement explicit enable/disable action in profile with version-gated requestWriteAccess and bot-settings fallback; preserve existing profile form.
- [x] Run miniapp tests, build/typecheck and affected browser scenarios.

### Task 5: Integration and rollout preparation

- [x] Independent review of delivery/permissions/retries and final copy; fix material findings with regression tests.
- [x] Full pnpm test, pnpm typecheck, pnpm build, appropriate Playwright checks, git diff --check.
- [x] Document migration/config rollout and examples, update approved spec status. Apply only bot metadata explicitly covered by this request after checks; avoid deploying unrelated dirty app changes. Report runtime activation limitations precisely.

## Progress

Plan created before implementation. Delivery choice treated as the approved recommended split; user approved the shown group/private scheme. Implementation proceeds without another approval round.

Completed: core 24, miniapp 94, worker 164 tests; 9 configuration tests; 41 browser scenarios (40 in full run plus approved-copy payment assertion rerun). Independent review findings fixed with RED/GREEN regressions. Deployed Worker 610736a1-9e10-4e74-b7d9-3d374f46d2df and applied bot metadata; no synthetic Telegram messages sent.
