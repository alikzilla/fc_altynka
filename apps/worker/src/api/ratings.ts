import { SKILLS, type SkillAnswers } from '@altynka/core';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, type AppEnv } from '../auth/middleware';
import { skillAssessments } from '../db/schema';
import { canManage, getEvent } from '../domain/events';
import { finishMatch, matchReview, playerProfile, playerRatings, submitReview } from '../domain/ratings';
import { body, idParam } from './validate';

export const ratingsApi = new Hono<AppEnv>();
const score = z.number().int().min(1).max(10);
const skillsBody = z.object({ teamwork: score, dribbling: score, technique: score, shooting: score, stamina: score, physical: score, passing: score, defending: score }).strict();
const reviewBody = z.object({ scores: z.array(z.object({ userId: z.number().int().positive(), score }).strict()).max(100), gameScore: score.nullable(), skipped: z.boolean() }).strict()
  .refine(v => v.skipped ? v.scores.length === 0 && v.gameScore === null : v.scores.length > 0 || v.gameScore !== null);

ratingsApi.get('/me/skills', async c => {
  const ratings = await playerRatings(c.get('deps').db, c.get('community').id, c.get('deps').now);
  return c.json(ratings.get(c.get('user').id)!.rating);
});
ratingsApi.put('/me/skills', body(skillsBody), async c => {
  const answers = c.req.valid('json');
  const { db, now } = c.get('deps');
  const communityId = c.get('community').id;
  const userId = c.get('user').id;
  await db.insert(skillAssessments).values({ communityId, userId, ...answers, createdAt: now }).onConflictDoNothing();
  const [saved] = await db.select().from(skillAssessments).where(and(eq(skillAssessments.communityId, communityId), eq(skillAssessments.userId, userId)));
  if (SKILLS.some(s => saved[s.key] !== answers[s.key as keyof SkillAnswers])) return c.json({ error: 'already_assessed' }, 409);
  return c.json((await playerRatings(db, communityId, now)).get(userId)!.rating);
});
ratingsApi.get('/players', async c => {
  const players = [...(await playerRatings(c.get('deps').db, c.get('community').id, c.get('deps').now)).values()];
  return c.json(players.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru')));
});
ratingsApi.get('/players/:userId', async c => {
  const userId = idParam(c.req.param('userId'));
  const profile = userId === null ? null : await playerProfile(c.get('deps').db, c.get('community').id, userId, c.get('deps').now);
  return profile ? c.json(profile) : c.json({ error: 'not_found' }, 404);
});

ratingsApi.post('/events/:id/finish', requireRole('organizer'), body(z.object({ participantSignupIds: z.array(z.number().int().positive()).min(1).max(100) }).strict()), async c => {
  const id = idParam(c.req.param('id'));
  const ev = id === null ? null : await getEvent(c.get('deps').db, id);
  if (!ev || ev.communityId !== c.get('community').id) return c.json({ error: 'not_found' }, 404);
  const result = await finishMatch(c.get('deps'), ev, c.get('user').id, c.req.valid('json').participantSignupIds);
  if (result !== 'ok') return c.json({ error: result }, result === 'invalid' ? 400 : 409);
  return c.json(await matchReview(c.get('deps').db, ev, c.get('user').id, true, c.get('deps').now));
});
ratingsApi.get('/events/:id/review', async c => {
  const id = idParam(c.req.param('id'));
  const ev = id === null ? null : await getEvent(c.get('deps').db, id);
  if (!ev || ev.communityId !== c.get('community').id) return c.json({ error: 'not_found' }, 404);
  return c.json(await matchReview(c.get('deps').db, ev, c.get('user').id, canManage(c.get('role')), c.get('deps').now));
});
ratingsApi.post('/events/:id/review', body(reviewBody), async c => {
  const id = idParam(c.req.param('id'));
  const ev = id === null ? null : await getEvent(c.get('deps').db, id);
  if (!ev || ev.communityId !== c.get('community').id) return c.json({ error: 'not_found' }, 404);
  const result = await submitReview(c.get('deps'), ev, c.get('user').id, c.req.valid('json'));
  if (result !== 'ok') return c.json({ error: result }, result === 'invalid' ? 400 : result === 'forbidden' ? 403 : 409);
  return c.json(await matchReview(c.get('deps').db, ev, c.get('user').id, canManage(c.get('role')), c.get('deps').now));
});
