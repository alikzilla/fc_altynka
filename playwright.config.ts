import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium' },
  projects: [
    { name: 'chromium' },
    { name: 'webkit-inputs', testMatch: '**/inputs.spec.ts', use: { browserName: 'webkit', isMobile: true, hasTouch: true, locale: 'ru-RU' } },
    { name: 'webkit-gestures', testMatch: '**/edge-back.spec.ts', use: { browserName: 'webkit', isMobile: true, hasTouch: true, locale: 'ru-RU' } },
    { name: 'webkit-ratings', testMatch: '**/player-ratings.spec.ts', use: { browserName: 'webkit', isMobile: true, hasTouch: true, locale: 'ru-RU' } },
  ],
  webServer: { command: 'pnpm --filter @altynka/miniapp exec vite preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
