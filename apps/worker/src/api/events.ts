import { Hono } from 'hono';
import { z } from 'zod';
import { todayAlmaty } from '@altynka/core';
import { eq } from 'drizzle-orm';
import { signups } from '../db/schema';
import { requireRole, type AppEnv } from '../auth/middleware';
import {
  addGuest, cancelEvent, createEvent, getEvent, joinEvent, leaveEvent, removeSignup, scheduleEvent,
} from '../domain/events';
import { eventDetail, listEvents, matchArchive, parseArchiveCursor } from '../domain/eventView';
import { body, idParam, statusFor } from './validate';

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const eventsApi = new Hono<AppEnv>();

eventsApi.get('/events', async c => {
  const { db } = c.get('deps');
  return c.json(await listEvents(db, c.get('community').id, c.get('user').id, c.get('deps').now));
});

eventsApi.get('/matches', async c => {
  const raw = c.req.query('cursor');
  const cursor = raw === undefined ? null : parseArchiveCursor(raw);
  if (raw !== undefined && !cursor) return c.json({ error: 'invalid_cursor' }, 400);
  return c.json(await matchArchive(c.get('deps').db, c.get('community').id, c.get('user').id, cursor, c.get('deps').now));
});

eventsApi.post(
  '/events',
  requireRole('organizer'),
  body(z.object({ date: z.iso.date(), communityId: z.number().int().positive().optional(), comment: trimmed(0, 200).optional() })),
  async c => {
    const v = c.req.valid('json');
    if (v.communityId !== undefined && v.communityId !== c.get('community').id) return c.json({ error: 'forbidden' }, 403);
    if (v.date < todayAlmaty(new Date(c.get('deps').now))) return c.json({ error: 'past_date' }, 400);
    const id = await createEvent(c.get('deps'), {
      communityId: c.get('community').id,
      date: v.date,
      comment: v.comment || null,
      createdBy: c.get('user').id,
    });
    return c.json({ id });
  },
);

/** Сбор должен существовать и принадлежать группе пользователя. */
async function ownEvent(c: { get: AppEnvGet; req: { param(k: string): string } }): Promise<number | null> {
  const id = idParam(c.req.param('id'));
  if (id === null) return null;
  const ev = await getEvent(c.get('deps').db, id);
  return ev && ev.communityId === c.get('community').id ? id : null;
}
type AppEnvGet = <K extends keyof AppEnv['Variables']>(k: K) => AppEnv['Variables'][K];

eventsApi.get('/events/:id', async c => {
  const id = idParam(c.req.param('id'));
  const dto =
    id === null
      ? null
      : await eventDetail(c.get('deps').db, id, {
          userId: c.get('user').id,
          role: c.get('role'),
          communityId: c.get('community').id,
        }, c.get('deps').now);
  return dto ? c.json(dto) : c.json({ error: 'not_found' }, 404);
});

eventsApi.post('/events/:id/join', async c => {
  const id = await ownEvent(c);
  if (id === null) return c.json({ error: 'not_found' }, 404);
  const r = await joinEvent(c.get('deps'), id, c.get('user').id);
  return c.json(r, statusFor(r.kind));
});

eventsApi.post('/events/:id/leave', async c => {
  const id = await ownEvent(c);
  if (id === null) return c.json({ error: 'not_found' }, 404);
  const r = await leaveEvent(c.get('deps'), id, c.get('user').id);
  return c.json(r, statusFor(r.kind));
});

eventsApi.post('/events/:id/guests', body(z.object({ name: trimmed(1, 24) })), async c => {
  const id = await ownEvent(c);
  if (id === null) return c.json({ error: 'not_found' }, 404);
  const r = await addGuest(c.get('deps'), id, c.get('user').id, c.req.valid('json').name);
  if (r.kind === 'duplicate') return c.json({ error: 'guest_exists' }, 409);
  return c.json(r, statusFor(r.kind));
});

eventsApi.post(
  '/events/:id/schedule',
  requireRole('organizer'),
  body(
    z.object({
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      durationHours: z.union([z.literal(1), z.literal(2)]),
      place: trimmed(0, 80).optional(),
    }),
  ),
  async c => {
    const id = await ownEvent(c);
    if (id === null) return c.json({ error: 'not_found' }, 404);
    const v = c.req.valid('json');
    const r = await scheduleEvent(c.get('deps'), id, { startTime: v.startTime, durationHours: v.durationHours, place: v.place || null });
    return c.json({ kind: r }, statusFor(r));
  },
);

eventsApi.post('/events/:id/cancel', requireRole('organizer'), async c => {
  const id = await ownEvent(c);
  if (id === null) return c.json({ error: 'not_found' }, 404);
  const r = await cancelEvent(c.get('deps'), id);
  return c.json({ kind: r }, statusFor(r));
});

eventsApi.delete('/signups/:id', async c => {
  const id = idParam(c.req.param('id'));
  if (id === null) return c.json({ error: 'not_found' }, 404);
  const [signup] = await c.get('deps').db.select().from(signups).where(eq(signups.id, id));
  const event = signup ? await getEvent(c.get('deps').db, signup.eventId) : null;
  if (!event || event.communityId !== c.get('community').id) return c.json({ error: 'not_found' }, 404);
  const r = await removeSignup(c.get('deps'), id, { userId: c.get('user').id, role: c.get('role') });
  return c.json({ kind: r }, statusFor(r));
});
