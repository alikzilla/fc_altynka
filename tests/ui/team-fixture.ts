import type { Page, Route } from '@playwright/test';

type Json = Record<string, any>;
const GROUP = { id: 1, title: 'FC Altynka' };

/**
 * Single-group bootstrap for specs that describe one viewer. Specs may keep their compact
 * mocks; this adapter lifts them to the unified-groups contract (no X-Community-Id):
 * `/api/me` gets `communities`, events/tasks/rating history carry `community`, match details
 * carry `viewerRole`, and `/api/players` is grouped. Bodies already in the new shape pass through.
 * These routes never call production.
 */
export async function teamApiRoute(page: Page, handler: (route: Route) => unknown) {
  let role = 'player';
  let community = GROUP;
  const withGroup = (items: unknown) => Array.isArray(items) ? items.map(i => i && typeof i === 'object' && !('community' in i) ? { ...i, community } : i) : items;
  const adapt = (path: string, body: any): any => {
    if (!body || typeof body !== 'object') return body;
    if (path === '/api/me') {
      if ('communities' in body) return body;
      const { role: r, community: c, ...rest } = body as Json;
      role = r ?? 'player';
      community = c ?? GROUP;
      return { ...rest, communities: [{ id: community.id, title: community.title, role }] };
    }
    if (path === '/api/events') return { ...body, active: withGroup(body.active), past: withGroup(body.past) };
    if (path === '/api/matches') return { ...body, events: withGroup(body.events) };
    if (path === '/api/notifications') return { ...body, tasks: withGroup(body.tasks) };
    if (path === '/api/players') return Array.isArray(body) ? { groups: [{ community, role, players: body }] } : body;
    if (/^\/api\/events\/\d+$/.test(path) && 'status' in body) return { ...body, community: body.community ?? community, viewerRole: body.viewerRole ?? role };
    return body;
  };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const adapted = Object.create(route) as Route;
    adapted.fulfill = options => route.fulfill(options?.json === undefined ? options : { ...options, json: adapt(path, options.json) });
    return handler(adapted);
  });
}
