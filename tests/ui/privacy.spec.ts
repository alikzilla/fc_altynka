import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

// A static page outside the SPA: it opens from the settings in Telegram's browser and from the BotFather link,
// so it must work without Telegram, fit 320px and pass the production CSP (the fixture fails on violations).
for (const [width, scheme] of [[320, 'dark'], [390, 'light']] as const) test(`the privacy policy reads at ${width}px ${scheme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: scheme });
  await page.setViewportSize({ width, height: 780 });
  const response = await page.goto('/privacy.html');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Политика конфиденциальности' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Кто что видит' })).toBeVisible();
  await expect(page.getByRole('link', { name: '@nuspekov' }).first()).toHaveAttribute('href', 'https://t.me/nuspekov');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});
