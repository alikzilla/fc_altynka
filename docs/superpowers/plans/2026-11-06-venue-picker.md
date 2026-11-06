# Venue Picker Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement the approved nested appointment/venue sheets with only Школа Аксай.

**Architecture:** Keep the scheduling route compatible and render Event behind an ActionSheet. A local venue catalogue and picker submit the existing string `place`. Share ActionSheet scroll ownership across nested dialogs.

**Tech Stack:** React, TypeScript, Wouter, TanStack Query, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-venue-picker-design.md`

## Global Constraints

- One venue, exact link https://go.2gis.com/G47G5, no invented address or price.
- Preserve API/DB and existing role/phase restrictions.
- Keep price and `/ час` on one line, both themes, narrow phones.

## Review Focus

- Nested Telegram Back closes only the top sheet; routing away unlocks body scrolling.
- Query refresh/return from 2GIS does not overwrite edited time/place.
- Existing free-text places survive saving without a replacement.
- Closed match / revoked permissions blocks pending scheduling.
- Save failure retains fields; rapid submit and late responses cannot duplicate or navigate away.

### Task 1: Scheduling and venue sheets

**Files:** `apps/miniapp/src/App.tsx`, `screens/Event.tsx`, `screens/Schedule.tsx`, `components/ActionSheet.tsx`, new `components/VenuePicker.tsx`, `lib/venues.ts`, `styles/venues.css`, `main.tsx`, `test/Schedule.test.tsx`.

**Interfaces:** `VENUES: readonly Venue[]`, `findVenue(place: string): Venue | undefined`; `VenuePicker({place,onSelect,onClose})`; ActionSheet accepts an optional className. Existing schedule endpoint still receives `{startTime,durationHours,place}`.

- [x] Write and run failing tests for selection/cancel, existing place, refresh, failure/pending/late save, nested Back/scroll cleanup, role/closed state.
- [x] Implement the catalogue, picker and appointment sheet over Event; preserve initial draft once and reuse ActionSheet. Keep nested modal scroll lock balanced.
- [x] Run focused Vitest tests, then the Mini App suite and typecheck.

### Task 2: Browser verification and delivery

**Files:** new `tests/ui/schedule-sheet.spec.ts`, existing `tests/ui/inputs.spec.ts`, `playwright.config.ts`, `DESIGN.md`.

**Interfaces:** Task 1 scheduling route and accessible dialog/button names.

- [x] Add browser coverage for the two sheets, focus/Back/escape, 2GIS, unchanged draft, fixed footer, one venue, narrow layouts and both themes; update old free-text input checks.
- [x] Run build, targeted Chromium/WebKit browser checks and required project checks. Inspect screenshots of the implementation.
- [x] Review final diff and document behavior.
- [ ] Deploy the verified build through the existing Worker workflow. All three Wrangler attempts and a separate read through Cloudflare MCP returned HTTP 503 (`no healthy upstream`). Publication is blocked by the external API; no deployment succeeded.

## Verification

- Baseline: 153 Mini App tests passed. Final: 160 passed.
- Core: 31 passed. Worker: 201 passed. Typecheck and production build passed.
- Full browser suite: 134 passed, 2 skipped; after final menu fix, all 12 scheduling tests passed in Chromium/WebKit.
- Reviewer found retained action menu under scheduling; reproduced in a failing test, fixed and verified.
- Production bundle and existing Worker bindings passed Wrangler dry run.
