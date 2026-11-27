import { animationsSettled, expect, type Locator, type Page } from './fixtures';

/** The sheet's height once its entry/exit animations are over and resize observers have had a frame. */
export async function sheetHeight(page: Page, sheet: Locator): Promise<number> {
  await animationsSettled(page);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return (await sheet.boundingBox())!.height;
}

/** Whether the sheet stands at its cap (its max height, or its content scrolls): then a growth cannot show in its box. */
export function sheetCapped(sheet: Locator): Promise<boolean> {
  return sheet.evaluate(dialog => {
    const content = dialog.querySelector<HTMLElement>('.sheet-content')!;
    return dialog.getBoundingClientRect().height >= parseFloat(getComputedStyle(dialog).maxHeight) - 1 || content.scrollHeight > content.clientHeight + 1;
  });
}

const contentHeight = (sheet: Locator) => sheet.locator('.sheet-content').evaluate(el => el.scrollHeight);

type Stability = {
  /** The sheet must not be at its cap before the action: a capped sheet stays at its cap whatever the content does. */
  uncapped?: boolean;
  /** Also check the content's full height does not grow: for a sheet held at its cap (a short screen, a fixed-height
   *  sheet), where a growth only shows as more to scroll. Shrinking is allowed, as for the box: a place reserved for
   *  the longest case (a long team name) may end up roomier than what arrives. */
  content?: boolean;
};

/** An action inside an open sheet must not change its height (1 px tolerance for subpixel rounding). */
export async function expectStableSheet(page: Page, sheet: Locator, action: () => Promise<void>, { uncapped = false, content = false }: Stability = {}): Promise<void> {
  const before = await sheetHeight(page, sheet);
  if (uncapped) expect(await sheetCapped(sheet), 'шторка уже упёрлась в максимум: рост не был бы виден').toBe(false);
  const inside = content ? await contentHeight(sheet) : 0;
  await action();
  const after = await sheetHeight(page, sheet);
  expect(Math.abs(after - before), `высота шторки изменилась: ${before} → ${after}`).toBeLessThanOrEqual(1);
  if (content) {
    const now = await contentHeight(sheet);
    expect(now - inside, `содержимое выросло: ${inside} → ${now}`).toBeLessThanOrEqual(1);
  }
}

/** How many lines a placeholder hint's text takes (the hint itself stretches over the placeholder's cell). */
export function hintLines(hint: Locator): Promise<number> {
  return hint.evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return Math.round(range.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
  });
}
