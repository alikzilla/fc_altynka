# Team editor implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement approved team editor v5, preserving team identity when uniform colors change.

**Architecture:** Keep numeric team indices for roster and game state. Store optional event color keys and a separate color revision; legacy events resolve red/blue/yellow. Save roster drafts through the existing endpoint, apply colors with an atomic color-only endpoint, then publish. Use the real ActionSheet and ToastProvider for editing and feedback.

**Tech Stack:** React, TypeScript, Hono, Drizzle/D1, Vitest, Playwright; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-07-team-kit-colors-design.md`, approved interactive prototype in `artifacts/team-editor-preview`.

## Global constraints

- Only swap two players; no single-player transfer. Only organizers/admins mutate.
- All pickers are existing bottom sheets. Undo uses the shared notification component.
- Color keys: red, blue, yellow, green, white, black; no duplicates per event.
- Preserve roster indices, ratings snapshots, goals, results, rotation and game revision on recolor.
- No deployment or production database writes are included in this implementation request.

## Review focus

- Colors remain consistent in roster, score entry, standings, scorers and Telegram.
- Stale color writes and changes after completion are rejected without overwriting a score.
- Repeated roster edits, undo and background refresh retain the reviewed draft.
- Failed publish/recolor retains the draft and cannot enable premature start.
- Existing events and guest-level editing remain compatible; missing team colors fall back safely.

### Task 1: Shared color model and persistence

Files: `packages/core/src/teams.ts`, `packages/core/src/api.ts`, core tests, `apps/worker/src/db/schema.ts`, migration `0012_team_colors.sql` and migration journal.

Interfaces: `TeamColor`, `TEAM_COLORS`, `teamAppearance(index, colors?)`, `teamColorsFor(count, colors?)`; optional `TeamsDto.colors`, `TeamsDto.colorsRevision` for old clients/fixtures.

- [x] Write and run failing tests for defaults, six colors and adding a third team without duplicates.
- [x] Add helpers, DTO fields and nullable JSON plus integer revision columns; update migration journal using existing format.
- [x] Verify core tests and migration application against test D1.

### Task 2: Atomic color update and Telegram

Files: worker domain/API teams, `sync/teamsPart.ts`, worker domain/API tests.

Interface: `PATCH /api/events/:id/teams/colors` with `{colors: TeamColor[], expectedRevision: number}`; return `{kind:'ok', colors, colorsRevision}`. CAS uses event id, color revision, team count, incomplete state and permitted status. Color-only writes never modify game revision/state or assignments.

- [x] Write and run failing tests for colors after kickoff, stale version, duplicate/unknown colors, wrong group/role, completed/cancelled event, and rendered Telegram labels.
- [x] Implement persistence/DTO, route validation and sync request for already published teams.
- [x] Run relevant worker tests; record the existing unrelated automatic-message test failure if it persists.

### Task 3: Approved editor and live team labels

Files: `screens/Teams.tsx`, focused team sheets/components, `GameTeamName.tsx`, `MatchGames.tsx`, `GameResultSheet.tsx`, scoped team CSS, miniapp tests.

- [x] Update tests for explicit swap bottom sheet, toast undo, canceling regenerated splits, draft/published/start state, colored published view and active recolor.
- [x] Replace editor with draft snapshots/history, explicit swap and color sheets, counts/averages and shared toast/action components. Preserve guest editing and rating snapshots.
- [x] Save draft roster, apply changed colors with expected revision, then publish. Keep drafts on failure, lock submitted controls, and reload on conflicts. After kickoff only recolor is available.
- [x] Resolve all team labels from `ev.teams.colors`, including accessible score controls and game history.
- [x] Run miniapp tests/typecheck and build.

### Task 4: Browser verification and review

Files: browser fixture/spec for the editor, documentation and this checklist.

- [x] Verify actual app at 320/390 widths in both themes: swap/undo, colors, publish/start, active recolor and error recovery. Check sheet bottom placement, toast alignment, overflow and focus.
- [x] Run full tests, typecheck, build and diff checks; distinguish unrelated failures.
- [x] Obtain one fresh review of the whole change, fix material findings and document verification. Leave changes reviewable in the current branch.

## Execution decisions

- User explicitly approved v5 and instructed implementation; proceed without another design/plan permission gate.
- Continue in the existing feature branch with approved notification changes. No additional worktree, deployment or unrelated backend fix.
- Color revision is independent of game revision. Draft colors are applied between roster save and publication so unreviewed colors never become a different team identity.

## Execution ledger

- Task 1: core color/default/expansion tests RED → GREEN; migration applied by local D1 test setup.
- Task 2: domain/API tests RED → GREEN, including concurrent CAS and Telegram color labels.
- Task 3: editor, failure recovery, stale-sheet and color-only tests RED → GREEN; real shared sheets/toasts and all game labels connected.
- Task 4: 38 browser checks passed; one fresh reviewer found four Important issues, fixed in one pass with regressions. See `docs/team-editor-review.md`.
- Ruling: no deployment/integration; user authorized implementation in the existing workspace. Changes remain reviewable.
- Ruling: the unrelated automatic-private-message baseline failure remains explicitly reported, without expanding this UI task into a Telegram retry redesign.

## Authorized production release

The user subsequently requested deployment and pushing to `main`. Completed fast-forward
integration and push, migration 0012 and production deployment after a fresh green suite
(599 unit/integration tests and 38 browser scenarios). All post-release checks passed;
see `docs/team-editor-deployment.md`. This supersedes the earlier implementation-only ruling.
