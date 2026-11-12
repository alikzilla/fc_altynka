import type { VenuesDto } from '@altynka/core';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, type AppEnv } from '../auth/middleware';
import { addVenue, listVenues, removeVenue, updateVenue } from '../domain/venues';
import { body, idParam } from './validate';

const optional = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null);
const httpsUrl = (v: string | null) => { if (v === null) return true; try { return new URL(v).protocol === 'https:'; } catch { return false; } };

const venue = z.object({
  // Название попадает в `events.place`, у которого тот же предел.
  name: z.string().trim().min(1).max(80),
  address: optional(120),
  mapUrl: optional(300).refine(httpsUrl),
  hourlyRate: z.number().int().min(0).max(10_000_000).nullish().transform(v => v ?? null),
});

/** Площадки группы: список видит любой участник, добавляет, правит и удаляет организатор. Группа — `?communityId=`. */
export const venuesApi = new Hono<AppEnv>();

venuesApi.get('/venues', async c => c.json<VenuesDto>({ venues: await listVenues(c.get('deps').db, c.get('community').id) }));

venuesApi.post('/venues', requireRole('organizer'), body(venue), async c => {
  const r = await addVenue(c.get('deps'), c.get('community').id, c.get('user').id, c.req.valid('json'));
  if (typeof r === 'string') return c.json({ error: r }, 409);
  return c.json({ venue: r, venues: await listVenues(c.get('deps').db, c.get('community').id) });
});

// Группа берётся из самой площадки (scopeCommunity в routes.ts): чужая выглядит как несуществующая.
venuesApi.patch('/venues/:id', requireRole('organizer'), body(venue), async c => {
  const id = idParam(c.req.param('id'));
  const r = id === null ? null : await updateVenue(c.get('deps').db, c.get('community').id, id, c.req.valid('json'));
  if (r === null) return c.json({ error: 'not_found' }, 404);
  if (r === 'duplicate') return c.json({ error: r }, 409);
  return c.json({ venue: r, venues: await listVenues(c.get('deps').db, c.get('community').id) });
});

venuesApi.delete('/venues/:id', requireRole('organizer'), async c => {
  const id = idParam(c.req.param('id'));
  if (id === null || !await removeVenue(c.get('deps').db, c.get('community').id, id)) return c.json({ error: 'not_found' }, 404);
  return c.json<VenuesDto>({ venues: await listVenues(c.get('deps').db, c.get('community').id) });
});
