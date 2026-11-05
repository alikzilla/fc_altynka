# Match Lifecycle Implementation Plan

> Use superpowers:executing-plans. User approved the workflow and clarified pre-scheduling signup.

**Goal:** Enforce collection → scheduled signup → started/frozen roster → billing → closed.
**Spec:** `docs/superpowers/specs/2026-11-05-match-lifecycle-design.md`
**Architecture:** Shared timezone-aware kickoff/phase helpers, request-time domain guards, derived playing DTO status, existing Durable Object for message refresh, boundary timers in the app. No database migration or dependency additions.

## Constraints and review focus

- Signup allowed before scheduling; all roster mutation paths close exactly at kickoff.
- Bills cannot be created before kickoff, including bot/direct API; legacy bill edits remain valid.
- Timezone is Asia/Almaty; reject scheduling a past kickoff and rescheduling a started game.
- Never replace Telegram retry/throttling alarms with a future kickoff alarm or delay dirty work until kickoff.
- Preserve clock injection in runtime tests and server-time display in the UI.
- Keep billing sheet, constant payment label, top notifications and all approved design changes.

### Task 1: Shared lifecycle

- [ ] Add kickoff/timezone/boundary tests; observe failures.
- [ ] Add matchStartsAt and matchPhase helpers; add derived playing status and optional serverNow to summary DTOs.
- [ ] Verify core tests and typecheck.

### Task 2: Domain, APIs and bot

- [ ] Add runtime tests for registration before scheduling, boundary blocking, early bill rejection, past scheduling and legacy bills.
- [ ] Enforce guards in shared domain mutations and compute phases in DTO/message rendering.
- [ ] Update Durable Object kickoff wakeup without interfering with sync/retry scheduling; add alarm tests.
- [ ] Adjust older fixtures to explicitly advance from pre-kickoff signup to post-kickoff billing.

### Task 3: Interface

- [ ] Add before/after-start component coverage and a live boundary browser check.
- [ ] Show the derived phase and one next step; explain when billing opens. Refresh on kickoff and app return.
- [ ] Keep signup available in collecting, and keep bill form a sheet.
- [ ] Update fixtures that previously created bills before the game's future start.

### Task 4: Acceptance

- [ ] Run core, worker and miniapp tests; typecheck/build; full browser checks.
- [ ] Fresh review of time boundaries, bot/API parity, alarm retries and legacy data.
- [ ] Update product/design docs and record final results. No deploy.
