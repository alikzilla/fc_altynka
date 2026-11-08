# Player profile statistics implementation plan

> Execute inline using superpowers:executing-plans; use a fresh whole-branch reviewer before merging.

**Goal:** Ship the approved full player profile with reliable historical statistics to main and production.

**Architecture:** Pure protocol summarization in core, permission-scoped read-only profile enrichment in worker, shared React sports components for own/peer profiles. No new persistent counters or migration.

**Tech Stack:** Existing TypeScript, React, Drizzle/D1, Vitest, Playwright, Wrangler.

**Spec:** `docs/superpowers/specs/2026-11-08-player-profile-statistics-design.md`

## Global constraints

Keep current settings, rating formula, signup/team/payment behavior and access boundaries. Assists zero. No date tile. Native Apple emojis. Existing deployments explicitly authorized by the user. Work in feature branch in the clean existing checkout; no extra worktree requested.

## Review focus

Unknown scorers/guests and duplicate names; updated or removed games; active sessions before review closes; hidden groups in foreign profiles; totals beyond 20 displayed sessions and empty/loading/error profiles.

### Task 1: Core statistics and worker profile enrichment

- [x] Write meaningful failing core/domain tests for frozen-team participation, scorers, edits/undo, guests, scopes and truncated history.
- [x] Implement `summarizePlayerProtocol`, aggregated statistics/achievement types, and permission-scoped worker profile enrichment.
- [x] Run core/worker tests and typecheck; changes form one atomic feature commit with UI.

### Task 2: Shared profile interface

- [x] Cover own/peer profile rendering, rating/feet semantics and preserved settings with tests.
- [x] Build shared card, rating sheet, achievements and history; wire live profile data. Preserve old review history, remove duplicate date tile.
- [x] Run miniapp tests/typecheck/build; UI included in atomic feature commit.

### Task 3: Browser verification and independent review

- [x] Exercise real components with realistic recorded games, both themes, 320/390 px, sheets and settings; update affected UI expectations.
- [x] Run full tests, typechecks and UI suite; get independent whole-branch review and address material findings.

### Task 4: Merge, deploy and production verification

- [x] Capture current deployment/settings/protocol state and expected profile counts; 45 production checks before deploy.
- [ ] Fast-forward merge into main, push main, dry-run and deploy via existing Wrangler workflow.
- [ ] Verify served assets, profiles/access controls and unchanged stored protocol data; document deployment version and checks.
