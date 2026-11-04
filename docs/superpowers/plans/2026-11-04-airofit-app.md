# Airofit app implementation plan

**Goal:** implement the user-approved five-screen Airofit concept in the existing Telegram miniapp.
**Spec:** docs/superpowers/specs/2026-11-04-reference-redesign-design.md
**Architecture:** keep React/Vite/Wouter and Worker/D1. Add narrow authenticated endpoints for archive and personal obligations; reuse existing match, signup, team and Kaspi flows. One shared notification resource supplies home, navigation and tasks.
**Execution:** user explicitly said «делай» after approving the coloured mockup. Continue implementation without another design or plan approval. Work on codex/airofit-app in the existing dirty checkout so prior work stays present; do not reset, stash, publish, or commit unrelated changes. A separate worktree would omit the substantial uncommitted implementation being extended.

## Shared contracts

- `MeDto.telegram?: { firstName: string; lastName: string | null; username: string | null; photoUrl: string | null }`, always populated by the updated server from verified initData. Optional type preserves older DTO fixtures and rolling update tolerance.
- `MatchArchiveDto { events: EventSummaryDto[]; nextCursor: string | null }`, `GET /api/matches?cursor=...`, descending date/id, 20 records per page, statuses billing/closed/cancelled. Reject invalid cursors with 400.
- `NotificationTaskDto` union: `{kind:'payment'; id:string; eventId:number; date:string; place:string|null; due:number; receiverName:string}` or `{kind:'schedule'; id:string; eventId:number; date:string; place:string|null}`.
- `NotificationsDto { tasks: NotificationTaskDto[] }`, `GET /api/notifications`. Payment is remaining debt on an open bill for the current member and group. Scheduling is collecting matches for organizers/admins. No fabricated read/unread lifecycle.

## Task 1: authenticated data (parallel backend owner)

- [x] Add contract and API tests first; observe failures.
- [x] Return verified Telegram identity in GET/PATCH me without schema migration; accept only HTTPS photo URLs.
- [x] Add archive pagination and obligations query with group/role filtering, deterministic ordering and stable IDs.
- [x] Verify identity refresh, pagination (including same-day records and invalid cursor), full/partial payment and role/group isolation. Run worker tests and typecheck.

## Task 2: working UI (root owner)

- [x] Add tests for five destinations and role-dependent create action, obligation navigation, archive pagination/error recovery, Telegram profile fallback and fixed dark theme.
- [x] Add shared notification resource and mutation/return refresh; no per-match fetching waterfall.
- [x] Implement Home carousel with native scroll snap and explicit previous/next controls, compact task preview and next games. Add Matches and Notifications screens. Keep existing detail routes, signup, guests, teams and billing.
- [x] Rebuild bottom navigation and profile; show creation/management only to permitted roles, including direct-route guard. Use verified profile photo with initials fallback and preserve club-name/Kaspi editing.
- [x] Replace old glass/background CSS with approved Airofit material tokens and solid dark ground. Carry material style to existing forms and details. Respect device safe areas, focus, reduced motion and increased contrast.

## Task 3: validation and review

- [x] Update browser fixtures and route assertions for the new UI. Test existing flows plus all new routes at 320, 390, 768 and 1440 px, both roles, long text, loading/error/empty states, pagination retry and payment task transitions.
- [x] Run whole workspace tests, types and production build. Review real production screenshots against approved concept. Run app inspector with explicitly requested surface-gradient and palette exceptions.
- [x] Independently review integrated implementation, address material findings and update DESIGN.md / PRODUCT.md to supersede obsolete glass requirements.
- [x] Report implemented behavior, verification and any actual limitations. No deployment unless separately authorized.

## Review focus

Personal debts never leak across users or groups. Fully paid bills disappear after mutation/return refresh. Equal-date archive records paginate once each. Missing/broken Telegram photos fall back to initials. All content scrolls clear of the fixed dock at 320 px with safe-area insets.

## Completion record

183 workspace tests and 11 production browser tests pass. Build, types and whitespace validation pass. Independent review findings were addressed with observed failing/passing regressions. Full review: docs/airofit-implementation-review.md. Current branch and uncommitted work are preserved for the user.
