# Small project structure cleanup

Preserve the existing workspace, app behavior, routes and public assets. The Worker already separates API, domain, persistence, bot and delivery code. Concentrate the cleanup on the mini-app's flat source directory.

1. Move reusable UI to `components/`, React behavior to `hooks/`, API/Telegram/theme helpers to `lib/`, shared contexts to `state/`, and CSS to `styles/`. Retain `App.tsx`, `main.tsx` and the current `screens/` structure. Update real imports and Vitest mocks together; use direct module imports without compatibility wrappers.
2. Make App provider nesting readable. Add a source map in the mini-app README and a documentation index; connect both from the root README. Ignore generated browser output, local package caches and macOS metadata.
3. Compare the production assets before/after the mechanical moves. Run existing workspace tests, typechecks, connector tests and browser smoke/gesture coverage. No new product behavior or tests are needed for file moves.

Baseline: 323 tests across core (24), mini-app (118) and Worker (181), plus workspace typechecks.
