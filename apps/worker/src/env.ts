/**
 * Bindings come from wrangler.jsonc through `pnpm --filter @altynka/worker types` (worker-configuration.d.ts);
 * `pnpm typecheck` fails when that file is stale.
 */
export type Env = Cloudflare.Env;
