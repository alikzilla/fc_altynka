import { defineConfig } from '@playwright/test';

const ci = !!process.env.CI;

export default defineConfig({
  testDir: './tests/ui',
  // In CI: a forgotten test.only fails the run; a retried pass is reported as flaky rather than hidden.
  forbidOnly: ci,
  retries: ci ? 2 : 0,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium' },
  projects: [
    { name: 'chromium' },
    { name: 'webkit-inputs', testMatch: '**/inputs.spec.ts', use: { browserName: 'webkit', isMobile: true, hasTouch: true, locale: 'ru-RU' } },
    { name: 'webkit-gestures', testMatch: '**/edge-back.spec.ts', use: { browserName: 'webkit', isMobile: true, hasTouch: true, locale: 'ru-RU' } },
    { name: 'webkit-ratings', testMatch: '**/player-ratings.spec.ts', use: { browserName: 'webkit', isMobile: true, hasTouch: true, locale: 'ru-RU' } },
    { name: 'webkit-schedule', testMatch: '**/schedule-sheet.spec.ts', use: { browserName: 'webkit', isMobile: true, hasTouch: true, locale: 'ru-RU' } },
    { name: 'webkit-overflow', testMatch: '**/horizontal-scroll.spec.ts', use: { browserName: 'webkit', isMobile: true, hasTouch: true, locale: 'ru-RU' } },
    { name: 'webkit-games', testMatch: '**/game-statistics.spec.ts', use: { browserName: 'webkit', isMobile: true, hasTouch: true, locale: 'ru-RU' } },
    { name: 'webkit-game-screen', testMatch: '**/game-screen.spec.ts', use: { browserName: 'webkit', isMobile: true, hasTouch: true, locale: 'ru-RU' } },
    // The keyboard path of bottom sheets on the iOS engine; the rest of the spec drives touch through Chromium's CDP.
    { name: 'webkit-sheets', testMatch: '**/sheet-interactions.spec.ts', grep: /@keyboard/, use: { browserName: 'webkit', isMobile: true, hasTouch: true, locale: 'ru-RU' } },
  ],
  webServer: { command: 'pnpm --filter @altynka/miniapp exec vite preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !ci },
});
