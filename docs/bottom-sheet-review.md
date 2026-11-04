# Bottom sheet and empty states — 2026-11-04

Implemented the user's correction to creation: the dialog rises from the bottom and can be pulled downward to dismiss. This supersedes the top-down presentation documented in the earlier match UX review. Existing server lifecycle rules and approved Airofit materials are preserved.

## Interaction

- Bottom anchoring, 32 px upper corners, visible grabber, 240 ms entry and 180 ms exit. Reduced motion keeps the gesture functional without travel animations.
- Drag the grabber/header with touch or mouse. A downward touch starting in non-interactive form space at scroll-top also drags the sheet. Inputs, selection, native date/group controls and an already-scrolled form retain their normal behavior.
- Short pulls settle back. Horizontal motion, cancellation, a second finger, lost pointer capture and window blur reset ownership. Cancelling a gesture does not restart the entrance animation. The next gesture works.
- Only a pointer interaction that starts and ends outside the sheet counts as a backdrop dismissal. Dragging/selecting text out of the dialog cannot accidentally close it.
- Submission locks dismissal and controls. The previous screen/query, keyboard focus, Escape and Telegram Back behavior remain intact.
- `visualViewport` changes update the available height and bottom offset for keyboard clearance. On supported Telegram clients (7.7+) the host's vertical minimize swipe is suspended while the sheet is open and restored afterward; a previously disabled setting stays disabled.

## Empty content

Removed large centred icon tiles. Empty views use a short left-aligned heading, explanation where needed and one natural-width action inside the same content group. Creation is offered only to organizers. Home hides an empty tasks section. Matches, archive, notifications, teams, bills and player management use the same treatment without invented example data.

Research informed the decision, rather than prescribing a copied layout: [Atlassian empty states](https://atlassian.design/components/empty-state/usage/) permits omitting illustrations and recommends concise text and relevant actions; [Stack Overflow's minimal empty states](https://stackoverflow.design/system/components/empty-states) distinguishes actionable and waiting states. Bottom-sheet interaction references: [Android Developers](https://developer.android.com/develop/ui/compose/components/bottom-sheets), [Material component anatomy](https://github.com/material-components/material-components-android/blob/master/docs/components/BottomSheet.md). Host gesture handling follows [Telegram's documented swipe API](https://core.telegram.org/bots/webapps).

## Verification

- `pnpm test`: **203 passed** — 24 core, 59 miniapp, 120 worker.
- `pnpm test:ui`: **28 passed** with a fresh production build. Chromium touch emulation via CDP, mouse, keyboard, 320/390/768/1440 widths, 320×568 scrolling, reduced motion, loading, role guards, and axe accessibility checks.
- `pnpm typecheck`, build and `git diff --check`: pass.
- Independent review found the horizontal header-to-backdrop dismissal. Its browser regression failed before the fix and passed afterward. The final suite includes actual lost-pointer-capture release, selection outside the sheet, interrupted touch/multitouch and pending submission.
- Mechanical detector: 101 palette advisories on the existing material stylesheet; no non-advisory findings.
- Inspected captures include `artifacts/ui/bottom-sheet-390.png`, `bottom-sheet-320.png`, `sheet-dragging-390.png` and `empty-390-*.png` for home, active/past matches, notifications, teams and players. All browser data is synthetic.

Physical iOS/Android Telegram sessions and actual software keyboards were not available. Touch evidence is Chromium emulation; Telegram API restoration is unit-tested. No deployment, push, new dependencies or global skill/plugin changes.
