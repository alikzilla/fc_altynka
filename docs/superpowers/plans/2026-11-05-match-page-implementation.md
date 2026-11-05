# Match Page Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Implement the approved match page and move transient notifications above the content.
**Architecture:** Keep current DTOs, routes and resource lifecycle. Extract a contextual fixed action and native action sheet; own participation in the persistent match summary, with roster management in the list. Billing and team forms retain their current algorithms.
**Tech Stack:** React 19, Wouter, TypeScript, Vite, CSS, Vitest and Playwright.
**Spec:** `docs/superpowers/specs/2026-11-05-match-page-approved-design.md`

## Global Constraints

- Preserve API authorization, queue order, lifecycle and server-side bill calculations.
- Keep Airofit and dark/light themes; one column up to 440 px, 20/16 px gutters.
- Use list/teams/bill URL values and Участники/Составы/Оплата labels.
- One contextual fixed action above dock; Kaspi stays in the payment card.
- Keep a permanent payment label so amount/recipient do not shift when marked paid.
- Move app toasts to the top and include Telegram/device safe areas.
- No dependency additions, deployment, or unrelated changes to existing user edits.

## Review Focus

- Participation changes while switching tabs must not duplicate a request.
- Long venue/name/comment and safe areas must preserve access above dock and footer.
- Bill refresh must preserve drafts while excluding departed signups.
- Paid, underpaid, receiver and closed bill states must expose only valid actions.
- Native sheets must restore focus, own Back and retain confirmations during mutations.

### Task 1: Match shell, participation and contextual actions

**Files:** Event.tsx, EventList.tsx, new MatchParticipation.tsx, MatchAction.tsx, ActionSheet.tsx; Icon.tsx; styles/app.css and themes.css.
**Interfaces:** MatchAction({children}); ActionSheet({title,onClose,busy?,children}); MatchParticipation({ev,reload}); EventList({ev,reload}). Child tabs consume optional actionBlocked to suppress competing actions.
- [x] Add failing behavior tests for participation on every tab, reserve action/position, explicit exit, organizer menu and priority scheduling.
- [x] Run focused Vitest tests and confirm expected failures.
- [x] Implement the approved header/card/tabs and contextual menus; move participation out of EventList.
- [x] Verify focused tests and existing role/mutation coverage; retain request locking and stale-response behavior.

### Task 2: Teams and billing

**Files:** Teams.tsx, Bill.tsx, Teams.test.tsx, Bill.test.tsx, MatchUx.test.tsx.
**Interfaces:** Teams/Bill({ev,reload,actionBlocked?}); fixed form submit remains a child of its form.
- [x] Add failing tests for explicit bill form opening, personal payment first, constant label and closed bill restrictions; update existing form entry tests.
- [x] Move team split/publication and bill creation/submission into contextual actions.
- [x] Keep Kaspi in a compact personal card; show expenses then payer list. Preserve due, units and recipient rules.
- [x] Verify billing/team tests including published player membership and refresh with a departed participant.

### Task 3: Top notifications and browser acceptance

**Files:** styles/app.css, tests/ui/match-page-redesign.spec.ts; existing tests with renamed tabs.
- [x] Add browser assertions for fixed action vs dock, top toast vs action, payment positions before/after marking, keyboard menus and scrolling last row above action.
- [x] Move toast to safe top inset and finish responsive styling from approved mockup.
- [x] Run build and focused browser tests in both themes at 320/390; inspect screenshots.

### Task 4: Verification and documentation

**Files:** DESIGN.md; current plan and execution ledger.
- [x] Run pnpm test, pnpm typecheck and pnpm test:ui; resolve regressions.
- [x] Obtain a fresh whole-change review; address material findings with regression checks.
- [x] Update DESIGN.md and mark completed tasks. Leave changes locally reviewable without deployment.

## Verification result

Implemented locally on `feat/match-page-redesign`. Final runs: `pnpm test` (core 24, miniapp 132, worker 181), `pnpm typecheck`, `pnpm test:ui` (85 passed, 1 existing WebKit trusted-touch skip). Three material review findings have regression tests and were fixed. No deployment.

## Follow-up: bill bottom sheet

User requested bill creation in a bottom sheet without leaving Payment. Creation and editing now use ActionSheet over the retained background with a separately pinned submit footer. The editor retains its identity if refresh discovers a persisted bill; pending state blocks dismissal and late responses cannot affect a departed screen. Keyboard focus skips collapsed reserve contents and includes its disclosure control. Component regressions pass, including discovery during a pending save.
