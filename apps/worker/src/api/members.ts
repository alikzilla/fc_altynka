import { normalizeKzPhone, type MeDto, type MemberDto } from '@altynka/core';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, type AppEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { bills, memberships, users } from '../db/schema';
import { effectiveRole, nameTaken } from '../domain/members';
import type { Env } from '../env';
import { body, idParam } from './validate';

const name = z.string().trim().min(1).max(24);

export const membersApi = new Hono<AppEnv>();

membersApi.get('/me', c => {
  const u = c.get('user');
  return c.json<MeDto>({ userId: u.id, displayName: u.displayName, role: c.get('role'), kaspiPhone: u.kaspiPhone });
});

membersApi.patch('/me', body(z.object({ displayName: name.optional(), kaspiPhone: z.string().max(40).nullable().optional() })), async c => {
  const v = c.req.valid('json');
  const set: { displayName?: string; kaspiPhone?: string | null } = {};
  if (v.displayName !== undefined) {
    if (await nameTaken(c.get('deps').db, v.displayName, c.get('user').id)) return c.json({ error: 'name_taken' }, 409);
    set.displayName = v.displayName;
  }
  if (v.kaspiPhone !== undefined) {
    if (v.kaspiPhone === null || v.kaspiPhone.trim() === '') {
      // по открытому счёту ему переводят — без номера счёт сломается
      const open = await c.get('deps').db.select({ id: bills.id }).from(bills)
        .where(and(eq(bills.receiverUserId, c.get('user').id), eq(bills.status, 'open'))).limit(1);
      if (open.length) return c.json({ error: 'receiver_needs_phone' }, 409);
      set.kaspiPhone = null;
    }
    else {
      const phone = normalizeKzPhone(v.kaspiPhone);
      if (!phone) return c.json({ error: 'bad_phone' }, 400);
      set.kaspiPhone = phone;
    }
  }
  const { db } = c.get('deps');
  const [u] = Object.keys(set).length
    ? await db.update(users).set(set).where(eq(users.id, c.get('user').id)).returning()
    : [c.get('user')];
  return c.json<MeDto>({ userId: u.id, displayName: u.displayName, role: c.get('role'), kaspiPhone: u.kaspiPhone });
});

async function membersOf(db: Db, env: Env, communityId: number, userId?: number): Promise<MemberDto[]> {
  const rows = await db
    .select({ m: memberships, u: users })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(userId === undefined ? eq(memberships.communityId, communityId) : and(eq(memberships.communityId, communityId), eq(memberships.userId, userId)));
  return rows
    .map(({ m, u }) => ({ userId: u.id, displayName: u.displayName, role: effectiveRole(env, u, m), level: m.level }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
}

membersApi.get('/members', requireRole('organizer'), async c =>
  c.json(await membersOf(c.get('deps').db, c.env, c.get('community').id)),
);

membersApi.patch(
  '/members/:userId',
  requireRole('admin'),
  body(z.object({ level: z.number().int().min(1).max(10).optional(), role: z.enum(['organizer', 'player']).optional(), displayName: name.optional() })),
  async c => {
    const userId = idParam(c.req.param('userId'));
    const communityId = c.get('community').id;
    const { db } = c.get('deps');
    const v = c.req.valid('json');
    const target = userId === null ? [] : await membersOf(db, c.env, communityId, userId);
    if (!target.length) return c.json({ error: 'not_found' }, 404);
    if (v.displayName !== undefined && (await nameTaken(db, v.displayName, userId!))) return c.json({ error: 'name_taken' }, 409);
    const m: { level?: number; role?: 'organizer' | 'player' } = {};
    if (v.level !== undefined) m.level = v.level;
    if (v.role !== undefined) m.role = v.role;
    if (Object.keys(m).length)
      await db.update(memberships).set(m).where(and(eq(memberships.communityId, communityId), eq(memberships.userId, userId!)));
    if (v.displayName !== undefined) await db.update(users).set({ displayName: v.displayName }).where(eq(users.id, userId!));
    return c.json((await membersOf(db, c.env, communityId, userId!))[0]);
  },
);
