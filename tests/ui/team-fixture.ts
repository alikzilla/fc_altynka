import type { Page, Route } from '@playwright/test';

/** Bootstrap for existing single-team fixtures; these routes never call production. */
export async function teamApiRoute(page: Page, handler: (route: Route) => unknown) {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const community = { id: 1, title: 'FC Altynka' };
    if (path === '/api/communities') return route.fulfill({ json: { communities: [community] } });
    if (path === '/api/context') return route.fulfill({ json: { community } });
    return handler(route);
  });
}
