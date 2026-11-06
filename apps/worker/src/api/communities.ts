import { Hono } from 'hono';
import type { AppEnv } from '../auth/middleware';
import { confirmedMembership, getCommunity } from '../domain/members';
import { makeTgClient } from '../telegram/client';
import { idParam } from './validate';

export const communitiesApi = new Hono<AppEnv>();

/**
 * A link from a group is a hint to check membership: Telegram confirms the person and the
 * membership row is created. It never selects a "current" group.
 */
communitiesApi.post('/communities/:id/join', async c => {
  const id = idParam(c.req.param('id'));
  const { db, now } = c.get('deps');
  const community = id === null ? null : await getCommunity(db, id);
  const m = community && await confirmedMembership(db, makeTgClient(c.env), community, c.get('user'), now, c.env.ADMIN_TG_ID);
  return community && m ? c.json({ community: { id: community.id, title: community.title } }) : c.json({ error: 'not_member' }, 403);
});
