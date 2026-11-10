import { FEED_REACTIONS } from '@altynka/core';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth/middleware';
import { hideFeedPost, listFeed, setFeedReaction } from '../domain/feed';
import { activeMemberships } from '../domain/members';
import { body, idParam } from './validate';

export const feedApi = new Hono<AppEnv>();

/** News of every group the person belongs to; a group they left disappears from their feed. */
feedApi.get('/feed', async c => {
  const groups = await activeMemberships(c.get('deps').db, c.env, c.get('user'));
  return c.json(await listFeed(c.get('deps'), groups.map(m => ({ id: m.community.id, title: m.community.title })), c.get('user').id));
});

/** One reaction per person: a value sets or replaces it, null removes it. */
feedApi.put('/feed/:id/reaction', body(z.object({ reaction: z.enum(FEED_REACTIONS).nullable() })), async c => {
  const id = idParam(c.req.param('id'));
  const groups = await activeMemberships(c.get('deps').db, c.env, c.get('user'));
  const result = id === null ? null : await setFeedReaction(c.get('deps'), id, c.get('user').id, groups.map(m => m.community.id), c.req.valid('json').reaction);
  return result ? c.json(result) : c.json({ error: 'not_found' }, 404);
});

/** Only an admin of the post's own group removes it; for everybody else it stays as it was. */
feedApi.delete('/feed/:id', async c => {
  const id = idParam(c.req.param('id'));
  const groups = await activeMemberships(c.get('deps').db, c.env, c.get('user'));
  const result = id === null ? 'not_found' : await hideFeedPost(c.get('deps'), id, c.get('user').id,
    groups.map(m => m.community.id), groups.filter(m => m.role === 'admin').map(m => m.community.id));
  return result === 'ok' ? c.json({ ok: true }) : c.json({ error: result }, result === 'forbidden' ? 403 : 404);
});
