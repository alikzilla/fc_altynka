import { Hono } from 'hono';
import type { AppEnv } from '../auth/middleware';
import { getEvent } from '../domain/events';
import { confirmedCommunities, confirmedMembership, getCommunity } from '../domain/members';
import { makeTgClient } from '../telegram/client';
import { idParam } from './validate';

export const communitiesApi = new Hono<AppEnv>();
const dto = (c: { id: number; title: string }) => ({ id: c.id, title: c.title });

communitiesApi.get('/communities', async c => {
  const rows = await confirmedCommunities(c.get('deps').db, makeTgClient(c.env), c.get('user'));
  return c.json({ communities: rows.map(dto) });
});

communitiesApi.get('/context', async c => {
  const id = idParam(c.req.query('eventId') ?? '');
  if (!id) return c.json({ error: 'not_found' }, 404);
  const { db, now } = c.get('deps');
  const event = await getEvent(db, id);
  const community = event ? await getCommunity(db, event.communityId) : null;
  if (!community) return c.json({ error: 'not_found' }, 404);
  const m = await confirmedMembership(db, makeTgClient(c.env), community, c.get('user'), now, c.env.ADMIN_TG_ID);
  return m ? c.json({ community: dto(community) }) : c.json({ error: 'not_member' }, 403);
});
