import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
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
          },
        },
      }),
    ],
    test: { globals: true, setupFiles: ['./test/setup.ts'] },
  };
});
