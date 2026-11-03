import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, type AppEnv } from '../auth/middleware';
import { getEvent } from '../domain/events';
import { publishTeams, saveTeams } from '../domain/teams';
import { body, idParam, statusFor } from './validate';

export const teamsApi = new Hono<AppEnv>();

teamsApi.use('/events/:id/teams/*', requireRole('organizer'));
teamsApi.use('/events/:id/teams', requireRole('organizer'));

const teamsBody = z.object({
  teamCount: z.union([z.literal(2), z.literal(3)]),
  teams: z.array(z.array(z.number().int())).max(3),
  guestLevels: z.record(z.string().regex(/^\d+$/), z.number().int()).default({}),
});

teamsApi.put('/events/:id/teams', body(teamsBody), async c => {
  const id = idParam(c.req.param('id'));
  const ev = id === null ? null : await getEvent(c.get('deps').db, id);
  if (!ev || ev.communityId !== c.get('community').id) return c.json({ error: 'not_found' }, 404);
  const v = c.req.valid('json');
  const guestLevels = Object.fromEntries(Object.entries(v.guestLevels).map(([k, lvl]) => [Number(k), lvl]));
  const r = await saveTeams(c.get('deps'), ev.id, { teamCount: v.teamCount, teams: v.teams, guestLevels });
  return c.json({ kind: r }, r === 'invalid' ? 400 : statusFor(r));
});

teamsApi.post('/events/:id/teams/publish', async c => {
  const id = idParam(c.req.param('id'));
  const ev = id === null ? null : await getEvent(c.get('deps').db, id);
  if (!ev || ev.communityId !== c.get('community').id) return c.json({ error: 'not_found' }, 404);
  const r = await publishTeams(c.get('deps'), ev.id);
  return c.json({ kind: r }, r === 'no_teams' ? 409 : statusFor(r));
});
