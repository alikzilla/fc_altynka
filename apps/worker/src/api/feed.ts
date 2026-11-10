import { Hono } from 'hono';
import type { AppEnv } from '../auth/middleware';
import { listFeed } from '../domain/feed';
import { activeMemberships } from '../domain/members';

export const feedApi = new Hono<AppEnv>();

/** News of every group the person belongs to; a group they left disappears from their feed. */
feedApi.get('/feed', async c => {
  const groups = await activeMemberships(c.get('deps').db, c.env, c.get('user'));
  return c.json(await listFeed(c.get('deps'), groups.map(m => ({ id: m.community.id, title: m.community.title }))));
});
