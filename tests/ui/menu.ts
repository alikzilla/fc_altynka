import type { Page } from '@playwright/test';

/** The dock's centre button opens the menu of sections; match creation is its first icon for organizers. */
export async function openCreateMatch(page: Page) {
  await page.getByRole('button', { name: 'Меню' }).click();
  await page.getByRole('dialog', { name: 'Меню' }).getByRole('link', { name: 'Создать матч' }).click();
}
