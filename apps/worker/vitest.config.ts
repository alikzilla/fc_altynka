import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  // wrangler требует существующую папку ассетов; в свежем клоне мини-апп ещё не собран
  mkdirSync(path.join(import.meta.dirname, '../miniapp/dist'), { recursive: true });
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BOT_TOKEN: 'test-token',
            WEBHOOK_SECRET: 'test-secret',
            ADMIN_TG_ID: '1',
            ALERT_CHAT_ID: '',
            // свои значения: тесты не должны зависеть от vars для деплоя в wrangler.jsonc
            BOT_USERNAME: 'fc_altynka_bot',
            MINIAPP_SHORT_NAME: 'app',
          },
          // Suites send many requests as one person; the 429 path is tested with a stub limiter (test/api/limits.test.ts).
          ratelimits: {
            API_LIMITER: { namespace_id: '1001', simple: { limit: 1_000_000, period: 60 } },
            WRITE_LIMITER: { namespace_id: '1002', simple: { limit: 1_000_000, period: 60 } },
          },
        },
      }),
    ],
    test: { globals: true, setupFiles: ['./test/setup.ts'] },
  };
});
