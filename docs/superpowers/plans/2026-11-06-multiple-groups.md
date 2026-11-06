# Multiple Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** One public bot supports independent Telegram teams without leaking participants, privileges or match data.

**Architecture:** Keep the shared Worker/D1 and Telegram identities. Select a community explicitly for each request, resolve object links before entering the app, and store team-specific profile fields on memberships. Derive admin rights from Telegram rather than the global owner ID.

**Tech Stack:** Hono, Drizzle/D1, grammY, React, TanStack Query, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-multiple-groups-design.md`

## Global Constraints

- Preserve current community IDs, history, payments, ratings and pre-existing workspace changes.
- Public `/bind` is available only to confirmed Telegram administrators of the target chat.
- Each group has independent members, matches, roles, profiles, payment details and notification preferences.
- A community ID or object link never grants authorization.
- Keep the established visual design. No production migration/deployment in this implementation.

## Review Focus

- A shared player editing their name, Kaspi or notification preferences must not affect another team (Task 1/3).
- A forwarded callback or substituted receiver/inviter must not cross a community boundary (Task 3/4).
- Old match links and entrance from the bot menu must resolve to an authorized community, with no arbitrary first-group fallback when ambiguous (Task 2/5).
- Switching teams while a request is in flight must not populate the new team's screen or submit an old form (Task 5).
- Revocation of Telegram admin rights or removal of the bot must revoke corresponding access and stop delivery (Task 2/4).

### Task 1: Community data and local member profiles

**Files:** `apps/worker/src/db/schema.ts`, `apps/worker/migrations/0009_multiple_groups.sql`, `apps/worker/src/domain/members.ts`, `apps/worker/test/domain/multipleGroups.test.ts`.

**Interfaces:** `getCommunity(db, id?)`, `communityByChat(db, chatId)`, `bindCommunity(db, chatId, title)`, `memberUser(user, membership): UserRow`, `communityUser(db, communityId, userId): Promise<UserRow|null>`, `ensureMembership(db, communityId, userId, checkedAt?)`.

- [x] Write tests: binding two chats creates distinct stable communities; rebind preserves both; local member profiles and equal names across teams are independent; migration retains legacy values without copying them to new memberships.
- [x] Run `pnpm --filter @altynka/worker test test/domain/multipleGroups.test.ts`; observe expected failures.
- [x] Add `communities.active`, `memberships.active`, local profile/notification columns and legacy migration markers. Backfill existing memberships; new memberships start from Telegram name and empty local preferences. Add local profile helpers and fail-safe single-community compatibility.
- [x] Run the task tests; expect PASS.

### Task 2: Authentication, team discovery and role checks

**Files:** `apps/worker/src/auth/middleware.ts`, `apps/worker/src/api/communities.ts`, `apps/worker/src/api/routes.ts`, `apps/worker/src/telegram/client.ts`, `packages/core/src/api.ts`, `apps/worker/test/api/communities.test.ts`.

**Interfaces:** `GET /api/communities` returns only confirmed memberships; `GET /api/context?eventId=...` validates event membership before returning team context. `X-Community-Id` selects a team on ordinary API requests. `TgClient.memberStatus(chatId, tgUserId)` returns `admin|member|left`.

- [x] Write tests: explicit A/B selection, ambiguous missing selection, nonmember denial including global owner, discovery without creating foreign memberships, event-link resolution, admin status revocation, inactive team denial.
- [x] Run the new API test file; expect FAIL.
- [x] Separate identity authentication from community authentication; check Telegram on entry and elevated writes, preserve ordinary member recheck cache, exclude inactive memberships. Keep single-team fallback only when unambiguous. Add bootstrap routes and typed DTO.
- [x] Run API tests; expect PASS.

### Task 3: Scoped profiles, objects and deliveries

**Files:** `apps/worker/src/api/members.ts`, `apps/worker/src/domain/{bills,ratings,eventView,events}.ts`, `apps/worker/src/sync/{parts,teamsPart,billPart,personal,automatic,EventSync}.ts`, `apps/worker/src/render/{eventMessage,personal}.ts`, `apps/worker/test/api/multipleGroups.test.ts`.

**Interfaces:** `usersById(db, ids, communityId)` returns local projected users. Existing DTO shapes remain compatible. Profile changes update memberships; theme and Telegram reachability remain identity-wide.

- [x] Write tests: cross-team profile/name/phone/subscription isolation, foreign object/read/write denial, foreign receiver and inviter rejection, rating/roster local names, notifications using originating team preferences and title.
- [x] Run relevant API/domain/sync tests; observe failures for the new cases.
- [x] Apply local projections throughout reads and renderers, scope payment phone updates and stale-payment guards, validate referenced members and ensure inactive teams cannot deliver. Retain existing automatic-notification work.
- [x] Run task tests; expect PASS.

### Task 4: Public binding and context-aware bot flows

**Files:** `apps/worker/src/bot/{bot,private,presentation}.ts`, `apps/worker/src/telegram/links.ts`, `apps/worker/scripts/set-webhook.sh`, `scripts/bot-profile.mjs`, `apps/worker/test/bot/{bot,multipleGroups}.test.ts`.

**Interfaces:** section links encode `c<communityId>_<section>`; object links retain `e/b/g/t/r<eventId>`. Private selection callbacks carry community+action explicitly; notification callbacks carry community ID. Member/bot lifecycle updates invalidate access.

- [x] Write tests: any actual group admin can bind; regular/anonymous sender cannot; bot needs admin/pin rights; repeat `/bind` is idempotent; callback event/chat mismatch cannot mutate; private choices/settings and personal payments resolve their own team.
- [x] Run bot tests; observe new failures.
- [x] Implement independent binding, explicit private team selection, local settings and role menus; check membership on callbacks. Handle member/bot removal and chat migration; opt webhook into membership updates.
- [x] Run bot tests; expect PASS.

### Task 5: App bootstrap, team selection and cache isolation

**Files:** `apps/miniapp/src/{App.tsx,lib/api.ts,lib/startParam.ts,lib/queryClient.ts}`, `apps/miniapp/src/state/community.ts`, `apps/miniapp/src/screens/CommunityGate.tsx`, `apps/miniapp/src/screens/Profile.tsx`, `apps/miniapp/src/hooks/useResource.ts`, `apps/miniapp/test/{startParam,community}.test.*`, `tests/ui/communities.spec.ts`.

**Interfaces:** client request context is immutable per invocation; query keys include community ID. A keyed app subtree is recreated on selection change. CommunityGate discovers confirmed teams or resolves an event link before loading `/api/me`.

- [x] Write tests: section parsing, legacy object links, selecting one of two teams, no-team onboarding, request header capture, stale cache isolation and teardown of open forms on switching.
- [x] Run miniapp task tests; expect FAIL.
- [x] Build team selection using existing UI components, show current team in app/profile and provide switch control. Capture context in requests and query functions; cancel/discard old requests and reset subtree on switching. Preserve current route and venue-sheet changes.
- [x] Run miniapp and browser team tests; expect PASS.

### Task 6: Integration, documentation and independent review

**Files:** existing test fixtures/helpers and README; spec/plan progress.

- [x] Update legacy test helpers to seed local member profiles and explicit Telegram admin status; replace obsolete single-group transfer expectations with independence assertions.
- [x] Run `pnpm typecheck`, `pnpm test`, `pnpm build`, relevant Playwright tests and `git diff --check`; inspect all results.
- [x] Update README with public binding, migration/rollback preparation, retained legacy links, and local verification limits.
- [x] Request fresh independent whole-change review against approved spec; address important findings with reproducing tests and rerun affected checks.
- [x] Record final checks and report local implementation; do not deploy production.

## Execution ledger

- Authorization: user approved design and explicitly requested implementation; execute inline without another plan approval.
- Workspace: current `feat/venue-picker` contains uncommitted authorized work. Work in place, preserving it; no reset, stash or broad commit of unrelated edits.
- Preflight: Tasks 2–5 depend on Task 1 local user projection; every new membership must use fresh local defaults. Task 5 client bootstrap routes must remain identity-only and must not depend on selected community.

- Task 1: complete — independent binding and member projection tests RED→GREEN; migration preservation verified with real legacy SQLite schema.
- Task 2: complete — team selection/discovery/object context tests RED→GREEN; no global owner bypass.
- Task 3: complete — local profile/roster mutation tests and foreign join/inviter tests RED→GREEN; two-team delivery tests pass.
- Task 4: complete — public binding/cross-chat callbacks RED→GREEN; private selection and lifecycle update tests pass.
- Task 5: complete — start links/cache/request tests RED→GREEN; live draft form teardown confirmed; existing UI tests adapted to bootstrap.
- Task 6: complete — full tests, build, migration test, type checks, browser checks and independent code/visual review completed.
- Ruling: Check Telegram membership live on every team API request instead of retaining daily cache. This makes revocation immediate, at the cost of more Telegram API calls; rate-limit handling remains in existing delivery machinery.
- Ruling: Work in the existing dirty feature branch, preserving previous venue-picker and automatic-notification work. No stash, reset, unrelated commit, merge, push or deployment performed.
- Baseline: two existing tests assumed immediate retry after 429 despite retryNotBefore. Updated test clocks to advance to the recorded deadline and assert that early alarms send nothing; production guard preserved.
- Final review fixed: consumed inactive-team alarms are rearmed through restoreCommunitySync on verified activation, preserving per-event delivery/dedup state. Reproducing bind test RED→GREEN; removal→consumed alarm→bind→one reminder integration passes.
- Final review fixed: confirmed departure consumes legacy owner entitlement, both at API/discovery checks and lifecycle updates. Leave→rejoin reproducer RED→GREEN; admin/member/left compatibility cases pass.
- Final race fix: community version rejects obsolete responses even after A→B→A; reproducer RED→GREEN.
- Visual review: independent screenshot-only disposition **ship** for picker/selected team at 390px and onboarding at 320px. Existing style preserved; design-system files were not rewritten. Detector reported inherited palette advisories in app.css; new styles use existing variables and introduce no literal colors.
- Deferred code minors: none identified by independent reviewer. Production migration/deployment and physical Telegram-device testing remain outside this local implementation.
