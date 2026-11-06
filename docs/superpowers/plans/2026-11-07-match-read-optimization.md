# Match Read Optimization Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and a final independent review.

**Goal:** Remove redundant database reads from match detail without changing responses or access.
**Architecture:** Compose detail from explicitly loaded event/queue/teams/bill/users. Keep existing standalone loaders as wrappers; no cross-request cache.
**Tech Stack:** TypeScript, Hono, Drizzle D1, Cloudflare Vitest.
**Spec:** `docs/superpowers/specs/2026-11-07-match-read-optimization-design.md`.

## Global Constraints

- No migrations, dependencies, UI, authorization, tariff changes or production deployment.
- Preserve existing standalone callers and response data.
- Work on `codex/optimize-match-reads` in the existing clean checkout; leave changes reviewable without merge/push.

## Review Focus

- Scheduled sessions must reuse prepared teams and preserve canStart/stale decisions.
- Ratings must retain chunking, defaults and player privacy.
- Bill recipients outside the active queue must still have current names/phones.
- Legacy, cancelled, empty and missing/foreign matches retain their existing responses.
- A subsequent request must see roster/results/profile/payment updates.

### Task 1: Reuse event and preparation snapshots

Files: `domain/events.ts`, `domain/teams.ts`, `domain/gameStart.ts`, `domain/bills.ts`, `domain/eventView.ts`; regression tests in `test/domain/eventReads.test.ts`.

- [x] Add runtime tests using a Drizzle logger to count real SQL, assert one full event read and one teams selection for scheduled/playing/finished/legacy details; assert API data and freshness.
- [x] Run the tests and observe failures from redundant reads.
- [x] Add helpers composing teams/protocol/bill from loaded rows, pass known queue limit and prepared teams, remove unused bill event read; retain standalone wrappers.
- [x] Run focused Worker tests and typecheck.

### Task 2: Reuse loaded users and verify the complete change

Files: `domain/ratings.ts`, `sync/parts.ts`, `domain/bills.ts`, `domain/eventView.ts`, `test/domain/eventReads.test.ts`.

- [x] Extend regression tests to assert one user selection for overlapping participant/rating/bill users and correct extra receiver data; observe redundant-query failures.
- [x] Accept request-local known users in rating and bill composition and fetch only missing IDs.
- [x] Run Worker suite, workspace tests/typecheck and diff checks.
- [x] Compare complete DTOs and query counts on the ignored production snapshot against the pre-change bundle; record results and obtain independent review.
- [x] Record verification and remaining production CPU-validation limitation. Leave implementation uncommitted for user review.
