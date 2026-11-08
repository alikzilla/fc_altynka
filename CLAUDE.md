# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

FC Altynka is a Telegram bot plus Telegram Mini App for organizing amateur football matches: signups with a reserve queue, scheduling, team balancing, in-match game statistics, cost splitting with Kaspi payment links, and anonymous post-match player ratings. All UI copy, bot messages and project docs are in Russian; keep new user-facing text and docs in Russian.

## Commands

pnpm monorepo (`pnpm@10`). Run from the repo root unless noted.

```bash
pnpm install
pnpm test                 # vitest in every package (core, miniapp, worker)
pnpm typecheck            # tsc --noEmit in every package
pnpm build                # build the mini app into apps/miniapp/dist
pnpm test:ui              # build + Playwright (Chromium + mobile WebKit projects, axe a11y)
pnpm test:migrations      # node:test migration checks against in-memory node:sqlite
pnpm test:connectors      # Telegram MCP connector + bot-profile script tests
pnpm run deploy           # build mini app + wrangler deploy (use `run`: `pnpm deploy` is a pnpm builtin)
```

Single test file / single test:

```bash
pnpm --filter @altynka/worker exec vitest run test/domain/games.test.ts
pnpm --filter @altynka/miniapp exec vitest run test/Teams.test.tsx -t "<test name>"
pnpm --filter @altynka/core exec vitest run test/queue.test.ts
pnpm exec playwright test tests/ui/team-editor.spec.ts --project=chromium
```

Local dev: `cp apps/worker/.dev.vars.example apps/worker/.dev.vars`, then in `apps/worker`: `pnpm exec wrangler d1 migrations apply fc-altynka --local && pnpm exec wrangler dev` (port 8787). `pnpm --filter @altynka/miniapp dev` runs Vite and proxies `/api` to 8787. Outside Telegram the mini app shows «Открой мини-апп из Telegram»; that is expected, since every API call needs signed initData.

## Architecture

Three workspace packages:

- `packages/core` (`@altynka/core`): pure domain logic with no I/O (queue/reserve, team balancing, ratings, game rotation and standings, bill splitting, formatting) **and the API DTO types** (`src/api.ts`) shared by worker and mini app. It is consumed as TypeScript source (`main: src/index.ts`), with no build step. Logic needed on both sides goes here.
- `apps/worker` (`@altynka/worker`): a single Cloudflare Worker that serves three things:
  - `/api/*`: Hono REST API (`src/api/`), validated with zod.
  - `/tg/webhook`: grammY bot (`src/bot/`), checked against `WEBHOOK_SECRET`.
  - Static mini-app assets from `../miniapp/dist` (SPA fallback via the `assets` config in `wrangler.jsonc`).
  - Plus a `*/5` cron (`scheduled`) that recovers pending post-match reviews.
- `apps/miniapp` (`@altynka/miniapp`): React 19 + Vite + Wouter + TanStack Query. `lib/api.ts` sends `Authorization: tma <initData>` and dispatches a `altynka:mutation` window event after every non-GET request; lists and task badges refresh on it. Telegram WebApp integration lives only in `lib/tg.ts`. New routes go in `App.tsx` and use the shared `Screen` from `components/ui.tsx`. The project uses plain relative imports with no path aliases, so when you move a file, update the test imports and the `vi.mock` paths as well.

### Worker layering

`api/` and `bot/` are thin adapters. Business rules live in `domain/`, which takes a `Deps` object `{ db, now, sync }` (see `domain/events.ts`). Tests inject fakes through it: `setDepsFactoryForTests` in `api/routes.ts`, plus `test/fakes/FakeSync` and `FakeTg`.

- **Auth / multi-group scoping** (`auth/middleware.ts`, `api/routes.ts`): `identityMiddleware` verifies Telegram initData and upserts the user. Object-scoped routes (`/events/:id/*`, `/bills/:id/*`, `/signups/:id`, …) resolve the owning community *from the object itself* via `scopeCommunity`, then check confirmed membership and role in that community. A foreign object returns 404, as if it did not exist. Person-scoped routes (`/me`, match feeds, `/players`) merge all of the user's groups. A user can belong to several independent communities (one per Telegram group). Roles, levels, ratings and notification settings are per-membership; the Telegram identity and theme are shared.
- **Telegram message sync** (`sync/`): domain code never calls Telegram directly. It calls `sync.request(eventId, { parts, notices, review })` (`sync/port.ts`). In production this goes to the `EventSync` Durable Object, one per event (`idFromName('event:<id>')`). The DO accumulates dirty parts (`event` | `teams` | `bill`) and notices in storage, debounces (300 ms burst, ≥3 s between sends, `sync/plan.ts`), re-renders from current D1 state (`render/`), edits the self-updating group messages, and honours 429 `retry_after`. Personal DMs (`sync/personal.ts`) and automatic reminders/review invitations (`sync/automatic.ts`) are also driven from the DO alarm.
- **DB**: D1 through Drizzle (`db/schema.ts`). Migrations are numbered SQL files in `apps/worker/migrations/` with `meta/_journal.json` and are applied by wrangler. Worker tests apply them all into a miniflare D1 (`test/setup.ts`) and wipe tables before each test. A new table must be added to the `TABLES` list there.

### Testing setup

- Worker tests run inside the Workers runtime via `@cloudflare/vitest-pool-workers` (`cloudflare:test` env, real D1 + DO bindings, test-only vars in `vitest.config.ts`).
- Mini app tests use happy-dom + Testing Library; the shared render helper is `test/render.tsx`.
- Playwright runs against `vite preview` of the production build on port 4173 with mocked API fixtures (`tests/ui/*-fixture.ts`). Several specs also run as dedicated mobile-WebKit projects (see `playwright.config.ts`).

## Deployment conventions

- Migrations that add schema must be applied to remote D1 **before** deploying the Worker that uses them (`wrangler d1 migrations apply fc-altynka --remote`). The README describes the extra ordering constraints for `0009_multiple_groups`.
- Production releases are recorded as `docs/<feature>-deployment.md`: commit, previous and new Worker version IDs, migration applied, test counts and verification steps. Backups and reports go to the git-ignored `artifacts/deploy/`. Do not create synthetic data in production.
- Secrets (`BOT_TOKEN`, `WEBHOOK_SECRET`) are wrangler secrets. Locally they live in `.dev.vars` and `apps/worker/.webhook.env`, both git-ignored. `pnpm bot:profile --apply` pushes bot name/description/commands; `pnpm check:telegram` is read-only diagnostics.

## Docs to consult

- `DESIGN.md`: authoritative visual and interaction rules for the mini app (Airofit materials, solid background, dock, bottom sheets, edge-back gesture, reduced motion). Read it before UI work. Styles live in `apps/miniapp/src/styles/` (`app.css` plus feature CSS, with theme overrides in `themes.css`).
- `PRODUCT.md`: users, purpose and product principles.
- `README.md`: the game-statistics rules (manual «Начать встречу», 3-team rotation, 3/1/0 standings), rating rules (8-skill questionnaire weighted as 3 matches, last 10 matches, min 3 votes, 72 h window) and multi-group behaviour.
- `docs/superpowers/specs/` and `docs/superpowers/plans/`: dated design specs and implementation plans for each feature. They record decisions at that date and may reference outdated paths; README/DESIGN.md describe the current state.
