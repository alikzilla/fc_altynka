# Team editor implementation review

Implemented the user-approved v5 prototype in the existing React application. Synthetic preview
data remains confined to artifacts/tests. Production rollout is recorded separately in
`team-editor-deployment.md` when completed.

## Delivered behavior

- Explicit two-player swap through the existing ActionSheet; no hidden selection or transfer mode.
- Snapshot undo for swaps, colors, guest levels, team count and generated alternatives. Feedback
  and Отменить use the actual shared ToastProvider.
- Six actual kit colors with occupied-color exchange, before and after kickoff. Player-facing
  own-team display, game/score/history/scorer labels and Telegram use the same event colors.
- Draft/publication/start states; failed saves preserve the reviewed draft. Repeated requests
  and response-loss recovery do not silently replace a reviewed color or roster.
- Counts/average ratings for organizers; guest-level controls and public sports profiles preserved.
- Compact scheduled-match header keeps participation and signup/exit controls available while
  leaving the first exchange action visible above the fixed footer.

## Storage and API

`0012_team_colors.sql` adds nullable `events.team_colors` JSON and a non-null color revision.
Legacy rows resolve to red/blue/yellow. `PATCH /api/events/:id/teams/colors` requires organizer
rights in the event group, validates distinct supported colors and count, and uses a conditional
single-row update against color revision/team count/incomplete state. It never writes assignments,
game state, game revision, rating snapshots or scores. Published changes request the existing
Telegram roster sync. Actual delivery and physical Telegram devices are separate from local tests.

Apply this migration before releasing the Worker/frontend that select the new columns.

## Independent review and fixes

A fresh read-only reviewer found four Important issues, all fixed with failing regressions first:

1. A successful roster stage followed by failed color PATCH could block retry. Saved-stage
   tracking recognizes its own server response and retains local undo/draft state.
2. An open color sheet could adopt a newer revision while retaining its old choice. The sheet
   now captures colors/revision at opening; stale live submissions fail CAS and stale draft
   selections require explicit review.
3. Color-only publishing could rewrite another organizer's roster. It now skips roster PUT
   entirely when only colors changed; unchanged rating snapshots remain untouched.
4. Switching three/two/three teams could restore a hidden stored third color. Reviewed arrays
   are compared without normalization before PATCH, so both count changes persist the actual choice.

Browser validation also caught inherited pointer-events on the publication footer and WebKit's
native select height. The footer enables its actual controls; guest selectors use a 44 px frame
and explicit native appearance reset. Notification sizing now follows the application's narrow
content inset. Lost color responses are reconciled against matching refreshed server colors.

## Verification

- Core suite: 43 passed. Miniapp suite: 229 passed. Worker team-domain/API tests: 10 passed.
- Typecheck and production frontend build: passed.
- 38 related browser scenarios across Chromium and WebKit: passed, including 280/320/390/430 px
  controls, guest swaps, score entry/history, color sheets, toast undo and publication retry.
- The full monorepo suite retains the pre-existing unrelated failure in
  `apps/worker/test/sync/automatic.test.ts:199` (blocked automatic private destination).
  It was reproduced before this feature; it is not changed as part of the editor.
- Mechanical design scan reports only advisory semantic kit colors; they are documented in DESIGN.md.

## Execution decisions and scope

- Continued in the existing feature branch with the already-approved notification changes;
  no additional worktree, integration or deployment was requested.
- No independent review findings were deferred. Excluded checks were actual production migration,
  Telegram delivery, physical devices and the unrelated automatic-sync baseline failure.

## Release verification — 7 November 2026

The user authorized deployment and pushing to `main`. A fresh complete release run passed:
43 core, 229 miniapp, and 327 Worker tests (599 total); the earlier automatic-sync failure
did not recur. All 38 related Chromium/WebKit browser scenarios, typecheck, production build
and Wrangler dry-run also passed. The pending remote migration is exactly `0012_team_colors.sql`.
The migration was rehearsed against a protected production SQL export: all 14 tables and
9 events preserved, with integrity and foreign-key checks passing.
