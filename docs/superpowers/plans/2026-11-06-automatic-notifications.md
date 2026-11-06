# Automatic Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the three approved automatic Telegram notifications.

**Architecture:** Extend EventSync's single durable alarm. Keep recipient schedules and successful deliveries in its storage; use PersonalDelivery's preference, membership and transport handling. Do not add cron or database migrations.

**Tech Stack:** TypeScript, Cloudflare Durable Objects/D1, Drizzle, Vitest Workers pool, React.

**Spec:** docs/superpowers/specs/2026-11-06-automatic-notifications-design.md

## Global Constraints

- Match: once per kickoff per recipient, current main roster including invited guests, 2 hours before start.
- Payments: after 24 hours, every 24 hours, maximum 3 successful automatic reminders per recipient/bill. Share manual reminder cooldown.
- Reviews: once after finish confirmation, actual account participants, no submission/skip, before 72h deadline.
- Payments/reviews: 10:00–21:00 Asia/Almaty. All automatic deliveries private and opt-in; no group fallback.
- No historical sweep or subscription-triggered backlog; no real Telegram test sends.
- Preserve existing uncommitted venue-picker changes. Work inline in current feature checkout; leave changes reviewable without committing unrelated work.

## Review Focus

- A manual reminder just before an automatic one must postpone it for 24h.
- A recipient may pay, leave, or submit while a different recipient's send is awaiting Telegram; re-read eligibility before that recipient's send.
- New work arriving during an alarm must survive, including arming review delivery.
- A 429 from any delivery must stop all further Telegram calls in that alarm; persisted retry time also governs early alarms.
- Disabled/unreachable recipients must not cause an immediate alarm loop or an automatic group mention.

### Task 1: Automatic schedules, private delivery and alarm integration

**Files:** Create `apps/worker/src/sync/automatic.ts`, `apps/worker/src/sync/automaticTime.ts`, `apps/worker/test/sync/automatic.test.ts`; modify `sync/EventSync.ts`, `sync/personal.ts`, `render/personal.ts`, `sync/port.ts`, `test/sync/EventSync.test.ts`.

**Interfaces:** `AutomaticNotifications(db, env, tg, storage, chatId)` exposes `run(eventId): Promise<void>` and `nextAt(eventId): Promise<number|null>`; `nextDeliveryTime(at: number): number` handles quiet hours. `PersonalDelivery.automatic(tgId, key, rendered): Promise<boolean|null>` reuses delivery and errors. `SyncRequest.review?: boolean` arms review notifications.

- [ ] Write runtime tests for match scheduling/main/guests/rescheduling/cancellation, debt frequency/limit/manual cooldown/quiet hours/paid-close/disabled recipients, and review eligibility; verify failures before implementation.
- [ ] Implement the scheduler and templates; read current event and recipient data immediately before each send, persist successful/terminal outcomes, and retain transient failures.
- [ ] Integrate alarm arming and nearest-deadline scheduling without disturbing pending dirty/notices; preserve 429 priority and kickoff refresh.
- [ ] Run `pnpm --filter @altynka/worker test -- test/sync/automatic.test.ts test/sync/EventSync.test.ts test/sync/personal.test.ts` (expect pass).

### Task 2: Finish hook and direct review link

**Files:** Modify `apps/worker/src/domain/ratings.ts`, `apps/worker/test/api/ratings.test.ts`, `apps/miniapp/src/lib/startParam.ts`, `apps/miniapp/test/startParam.test.ts`.

**Interfaces:** Successful/retried `finishMatch` requests `{ parts: [], review: true }`. `r<id>` opens `/event/<id>/review` with existing positive-safe-ID validation.

- [ ] Add failing tests for the finish hook (including identical retries) and valid/invalid review deep links; observe failures.
- [ ] Implement hook and routing; run affected tests (expect pass).

### Task 3: Integration verification and review

- [ ] Add runtime regressions for 429, network retries, stale recipient data, interrupted/repeated alarms and review arming during delivery; observe failures where relevant before fixing.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm build`, `git diff --check` (expect pass); read outputs.
- [ ] Obtain one fresh code review of the notification diff; fix material findings with regression tests.
- [ ] Update README and spec status; report implementation and verification, distinguishing local changes from deployment.
