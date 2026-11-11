import { AVAILABILITY_DAYS, DAY_PARTS, addDays, normalizeMark, todayAlmaty, type AvailabilityDto, type AvailabilitySummaryDto } from '@altynka/core';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, type AppEnv } from '../auth/middleware';
import { availabilitySummary, getAvailability, saveDay, saveWeekly } from '../domain/availability';
import { body } from './validate';

const mark = z.object({ status: z.enum(['yes', 'no']), parts: z.array(z.enum(DAY_PARTS)).max(DAY_PARTS.length).default([]) }).nullable();

/** Календарь доступности: личный (общий для всех групп) и сводка по группе для организатора. */
export const availabilityApi = new Hono<AppEnv>();

availabilityApi.get('/availability', async c => {
  const { db, now } = c.get('deps');
  return c.json<AvailabilityDto>(await getAvailability(db, c.get('user').id, now));
});

availabilityApi.put('/availability/weekly', body(z.object({ weekly: z.array(mark).length(7) })), async c => {
  const { db, now } = c.get('deps');
  await saveWeekly(db, c.get('user').id, c.req.valid('json').weekly.map(m => m && normalizeMark(m)));
  return c.json<AvailabilityDto>(await getAvailability(db, c.get('user').id, now));
});

availabilityApi.put('/availability/days/:date', body(z.object({ mark })), async c => {
  const { db, now } = c.get('deps');
  const date = c.req.param('date');
  const today = todayAlmaty(new Date(now));
  // Только даты календаря: прошедшие и далёкие дни не отмечаются.
  if (!z.iso.date().safeParse(date).success || date < today || date >= addDays(today, AVAILABILITY_DAYS)) return c.json({ error: 'bad_date' }, 400);
  const v = c.req.valid('json').mark;
  await saveDay(db, c.get('user').id, date, v && normalizeMark(v), now);
  return c.json<AvailabilityDto>(await getAvailability(db, c.get('user').id, now));
});

// Группа названа явно: `?communityId=` (scopeCommunity в routes.ts). Имена видит только организатор.
availabilityApi.get('/availability/summary', requireRole('organizer'), async c => {
  const { db, now } = c.get('deps');
  return c.json<AvailabilitySummaryDto>(await availabilitySummary(db, c.get('community'), now));
});
