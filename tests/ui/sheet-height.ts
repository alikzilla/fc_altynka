import { animationsSettled, expect, type Locator, type Page } from './fixtures';

/** The sheet's height once its entry/exit animations are over and resize observers have had a frame. */
export async function sheetHeight(page: Page, sheet: Locator): Promise<number> {
  await animationsSettled(page);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return (await sheet.boundingBox())!.height;
}

/** An action inside an open sheet must not change its height (1 px tolerance for subpixel rounding). */
export async function expectStableSheet(page: Page, sheet: Locator, action: () => Promise<void>): Promise<void> {
  const before = await sheetHeight(page, sheet);
  await action();
  const after = await sheetHeight(page, sheet);
  expect(Math.abs(after - before), `высота шторки изменилась: ${before} → ${after}`).toBeLessThanOrEqual(1);
}
