# Match UX verification — 2026-11-04

Creation motion and empty-state presentation were subsequently revised at the user’s request; see `bottom-sheet-review.md` for the current bottom-sheet behavior.

Implemented the user's creation overlay, active/past matches, loading and lifecycle audit on `codex/airofit-app`, preserving the pre-existing design worktree. No deployment, push or global tooling changes.

## Verified changes

- Native top dialog, real authenticated group title, date/comment validation, inline errors preserving input, submission lock, success -> `/matches` Active. Escape, close/backdrop, focus wrapping/restoration and Telegram Back ownership.
- Both background pathname and query remain stable under the modal. Closing preserves the selected archive/event tab rather than rebuilding it. A late response after browser Back cannot redirect the person's new screen.
- Active collecting/scheduled games, Past paginated billing/closed/cancelled archive. Focus/mutation refresh; older pages reset on a fresh archive response; late pagination results are ignored.
- Full-width skeletons for bootstrap, home, tasks, active/past lists, detail, schedule and player management. Placeholder bars represent text; card/container widths match the full content column. Profile and guest form have no extra data load after bootstrap.
- Domain/API 409 `not_scheduled` before billing; failed attempt does not change phone, bill or event. Scheduling/cancelling remains locked during billing. Legacy existing bills can still be edited where open.
- Bill form validates complete expenses and positive total, preserves valid roster selections and entered amounts across refresh, removes departed players from submitted IDs. Editing can be cancelled; a bill closed elsewhere returns to read-only presentation.
- Team publishing rejects stale/closed matches. Signup deletion is scoped to authenticated community.

## Evidence

- `pnpm test`: **201 passed** (24 core, 57 miniapp, 120 worker).
- `pnpm test:ui`: **20 passed**, fresh production build, Chromium at 320/390/768/1440, a 320×568 creation scenario, reduced motion, contrast, delayed resource loading, accessibility checks.
- `pnpm typecheck`, production build and `git diff --check`: pass.
- Independent reviewer confirmed the background query problem and found late-create navigation and departed bill-participant cases. Each was reproduced as a failing regression and fixed; final suites green.
- Mechanical design detector: 103 palette advisories across the existing material stylesheet, no non-advisory findings. Approved Airofit materials retained; new loading/step tones recorded in DESIGN.md.
- Screenshots inspected: `artifacts/ui/ux-create-390.png`, `ux-loading-390.png`, `ux-auth-loading-390.png`, active/past and match-detail screenshots. Browser screenshots use synthetic fixtures.

Modal behavior follows [W3C APG dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and the native [HTML dialog API](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).

## Product constraints retained

Only one Telegram group is currently bound: the field displays that real group; multi-group routing is not invented. Appointment requires time and duration, with optional venue. Billing requires appointment but is not blocked until a calendar end time, which the user did not request. No database migration. Physical Telegram iOS/Android and actual bank transfers remain outside browser verification.
