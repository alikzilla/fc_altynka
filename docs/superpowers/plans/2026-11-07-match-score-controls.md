# Match score controls implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Release the approved score and history UI in the existing Telegram miniapp.

**Architecture:** Keep GameResultSheet's existing request lifecycle. Pure goal-run helpers preserve per-goal author order while producing the unchanged aggregate API payload. Reuse ActionSheet for history and shared result rows.

**Tech Stack:** React, TypeScript, existing CSS, Vitest, Playwright, Wrangler.

**Spec:** `docs/superpowers/specs/2026-11-07-match-score-controls-design.md`

## Global constraints

- No API/schema changes or production test writes.
- Preserve sulifa, stale-draft protection, retries and organizer permissions.
- Work from `codex/optimize-match-reads`, the published server baseline.
- Match the approved preview and preserve 44px hit areas.

## Review focus

- Repeated authors and an unknown goal between them survive reopening.
- Removing a goal removes exactly its author contribution.
- Existing drafts and lost-response retry commands stay compatible.
- Very large saved scores cannot allocate proportional arrays.
- History editing, focus restoration, keyboard operation, guests and narrow WebKit layouts work.

### Task 1: Score and author cards

Files: `lib/gameGoalRuns.ts`, `lib/gameDraft.ts`, `screens/GameResultSheet.tsx`, `styles/games.css`, component/helper tests.

- [x] Write failing tests for run conversion, removal, unknown positions, duplicate authors, huge scores, score buttons, persisted cards and locked retries.
- [x] Run those tests and observe expected failures.
- [x] Implement run helpers and optional compatible draft metadata; replace the numeric controls with the approved score and author cards.
- [x] Run helper, draft and result-sheet tests; expect all passing.

### Task 2: History and numeric layout

Files: `screens/MatchGames.tsx`, `styles/games.css`, `MatchGames.test.tsx`, `tests/ui/game-statistics.spec.ts`.

- [x] Add failing assertions for latest-three order, complete history and edit permissions.
- [x] Implement shared result rows and history ActionSheet; apply tabular figures and approved spacing.
- [x] Update browser interactions to the new controls. Verify fast repeated taps, fixed button positions, per-goal removal, guest names, focus and both themes at 320/390px.
- [x] Run typecheck, full unit/server suite, production build and browser suite.

### Task 3: Review and release

- [x] Request a fresh code review; resolve actionable findings and rerun affected checks.
- [ ] Capture production version/settings and read-only smoke state, verify the local Worker packaging, deploy, then check the served assets and API responses.
- [ ] Record release evidence and any physical-device validation limit. Commit the implementation and report the published result.
