import { expect, test as base } from '@playwright/test';

export * from '@playwright/test';

/**
 * Wait until finite animations on the page are over (screen reveal, sheet entry). Contrast and layout checks taken
 * mid-fade measure a half-transparent colour; infinite ones (skeleton pulse) are ignored.
 */
export async function animationsSettled(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => a.effect?.getComputedTiming().endTime !== Infinity)
    .map(a => a.finished.catch(() => undefined))));
}

/**
 * Blocks that scroll sideways on purpose: the match carousel, the availability strip, the game table
 * and the statistics tabs. Anything else that scrolls sideways is a layout bug.
 */
export const HORIZONTAL_SCROLLERS = ['.match-carousel', '.ceremony-cards', '.availability-strip', '.game-table-scroll', '.stat-groups', '.stat-boards'];

type Overflow = { where: string; scrollWidth: number; clientWidth: number; viewport: number; culprits: string[] };

/**
 * Watches the page during the whole test: the document and every scrollable block (sheets, lists)
 * must never get wider than their box. Runs in the page, so it also sees sheets that open and close
 * mid-test, at whatever width the test uses.
 */
function watchOverflow(allowed: string) {
  const found = new Map<string, Overflow>();
  const name = (el: Element) => el === document.documentElement ? 'страница'
    : el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + [...el.classList].map(c => `.${c}`).join('');
  const record = (el: Element, scrollWidth: number, clientWidth: number) => {
    const where = `${name(el)} @ ${location.pathname}${location.search}`;
    if (found.has(where)) return;
    // The outermost elements that stick out past the right edge: what to fix.
    const edge = el === document.documentElement ? innerWidth : el.getBoundingClientRect().right;
    const out = (e: Element) => e.getBoundingClientRect().right > edge + 1;
    const culprits = [...el.querySelectorAll('*')].filter(e => out(e) && !(e.parentElement && e.parentElement !== el && out(e.parentElement)))
      .slice(0, 4).map(e => `${e.parentElement ? `${name(e.parentElement)} > ` : ''}${name(e)} «${(e.textContent ?? '').trim().slice(0, 30)}» +${Math.round(e.getBoundingClientRect().right - edge)}px${getComputedStyle(e).transform !== 'none' ? ' (transform)' : ''}`);
    const entry = { where, scrollWidth, clientWidth, viewport: innerWidth, culprits };
    found.set(where, entry);
    void (window as unknown as { __reportOverflow?: (o: Overflow) => Promise<void> }).__reportOverflow?.(entry);
  };
  const check = () => {
    // A full-page screenshot briefly shrinks the window to a few pixels: no phone is that narrow.
    if (innerWidth < 240) return;
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + 1) record(root, root.scrollWidth, root.clientWidth);
    for (const el of document.body?.querySelectorAll('*') ?? []) {
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      const style = getComputedStyle(el);
      if (style.overflowX !== 'auto' && style.overflowX !== 'scroll') continue;
      if (el.matches(allowed)) continue;
      record(el, el.scrollWidth, el.clientWidth);
    }
  };
  const safe = () => { try { check(); } catch { /* the page is going away */ } };
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; safe(); });
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  addEventListener('resize', safe);
  // Animations change layout without DOM mutations.
  setInterval(safe, 120);
  (window as unknown as { __checkOverflow: () => void }).__checkOverflow = safe;
}

type CspViolation = { directive: string; blocked: string; where: string };

export const test = base.extend<{ noHorizontalScroll: void; noCspViolations: void }>({
  // vite preview serves the production CSP from public/_headers: anything the policy blocks in a test is blocked in Telegram too.
  noCspViolations: [async ({ page }, use) => {
    const violations: CspViolation[] = [];
    await page.exposeFunction('__reportCsp', (v: CspViolation) => { violations.push(v); });
    await page.addInitScript(() => {
      addEventListener('securitypolicyviolation', e => {
        void (window as unknown as { __reportCsp?: (v: CspViolation) => Promise<void> }).__reportCsp?.({ directive: e.effectiveDirective, blocked: e.blockedURI, where: location.pathname });
      });
    });
    await use();
    expect(violations, 'CSP из public/_headers заблокировал ресурс').toEqual([]);
  }, { auto: true }],
  noHorizontalScroll: [async ({ page }, use) => {
    const overflow: Overflow[] = [];
    // Reports leave the page at once, so a later navigation does not lose them.
    await page.exposeFunction('__reportOverflow', (o: Overflow) => { overflow.push(o); });
    await page.addInitScript(watchOverflow, HORIZONTAL_SCROLLERS.join(', '));
    await use();
    await page.evaluate(() => (window as unknown as { __checkOverflow?: () => void }).__checkOverflow?.()).catch(() => {});
    expect(overflow, 'горизонтальный скролл: блок шире своей области').toEqual([]);
  }, { auto: true }],
});
