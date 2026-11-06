import { APP_THEMES, DOMINANT_FEET, PLAYING_POSITIONS, normalizeKzPhone, type AppTheme, type DominantFoot, type PlayingPosition, type MeDto, type MemberDto } from '@altynka/core';
import { and, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireRole, type AppEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { memberships, users, type UserRow } from '../db/schema';
import { openBillsReceivedBy, resyncReceiverBills } from '../domain/bills';
import { activeMemberships, confirmedMemberships, effectiveRole, nameTaken, type MyMembership } from '../domain/members';
import { playerRatings } from '../domain/ratings';
import type { Env } from '../env';
import { makeTgClient } from '../telegram/client';
import { body, idParam } from './validate';

const name = z.string().trim().min(1).max(24);

export const membersApi = new Hono<AppEnv>();
const profileDetails = (u: UserRow) => ({ profileCompleted: u.profileCompletedAt !== null || !!u.kaspiPhone, playingPosition: u.playingPosition, dominantFoot: u.dominantFoot, theme: u.theme });

async function meDto(c: Context<AppEnv>, u: UserRow, groups: MyMembership[]): Promise<MeDto> {
  const { db, now } = c.get('deps');
  return {
    rating: (await playerRatings(db, [u.id], now)).get(u.id)!.rating,
    userId: u.id,
    displayName: u.displayName,
    kaspiPhone: u.kaspiPhone,
    ...profileDetails(u),
    notifications: { enabled: u.notificationsEnabled, available: u.pmAvailable },
    telegram: c.get('telegram'),
    communities: groups.map(g => ({ id: g.community.id, title: g.community.title, role: g.role })),
  };
}

/** The only person-scoped request that re-checks every group in Telegram. */
membersApi.get('/me', async c => {
  const { db, now } = c.get('deps');
  const groups = await confirmedMemberships(db, makeTgClient(c.env), c.env, c.get('user'), now);
  return c.json<MeDto>(await meDto(c, c.get('user'), groups));
});

membersApi.patch('/me', body(z.object({ displayName: name.optional(), kaspiPhone: z.string().max(40).nullable().optional(), notificationsEnabled: z.boolean().optional(), profileCompleted: z.literal(true).optional(), playingPosition: z.enum(PLAYING_POSITIONS).nullable().optional(), dominantFoot: z.enum(DOMINANT_FEET).nullable().optional(), theme: z.enum(APP_THEMES).optional() })), async c => {
  const v = c.req.valid('json');
  const { db, now } = c.get('deps');
  const me = c.get('user');
  const set: { displayName?: string; kaspiPhone?: string | null; notificationsEnabled?: boolean; profileCompletedAt?: number; playingPosition?: PlayingPosition | null; dominantFoot?: DominantFoot | null; theme?: AppTheme } = {};
  if (v.theme !== undefined) set.theme = v.theme;
  // Keep legacy saved profiles completed even if their phone is now being removed.
  if (me.kaspiPhone && me.profileCompletedAt === null) set.profileCompletedAt = now;
  if (v.profileCompleted && me.profileCompletedAt === null) set.profileCompletedAt = now;
  if (v.playingPosition !== undefined) set.playingPosition = v.playingPosition;
  if (v.dominantFoot !== undefined) set.dominantFoot = v.dominantFoot;
  if (v.notificationsEnabled !== undefined) {
    if (v.notificationsEnabled && !me.pmAvailable) return c.json({ error: 'write_access_required' }, 409);
    set.notificationsEnabled = v.notificationsEnabled;
  }
  if (v.displayName !== undefined) {
    if (await nameTaken(db, v.displayName, me.id)) return c.json({ error: 'name_taken' }, 409);
    set.displayName = v.displayName;
  }
  if (v.kaspiPhone !== undefined) {
    if (v.kaspiPhone === null || v.kaspiPhone.trim() === '') {
      // по открытому счёту ему переводят — без номера счёт сломается
      if ((await openBillsReceivedBy(db, me.id).limit(1)).length) return c.json({ error: 'receiver_needs_phone' }, 409);
      set.kaspiPhone = null;
    }
    else {
      const phone = normalizeKzPhone(v.kaspiPhone);
      if (!phone) return c.json({ error: 'bad_phone' }, 400);
      set.kaspiPhone = phone;
      if (me.profileCompletedAt === null) set.profileCompletedAt = now;
    }
  }
  const u = Object.keys(set).length ? (await db.update(users).set(set).where(eq(users.id, me.id)).returning())[0] : me;
  if (set.kaspiPhone !== undefined && set.kaspiPhone !== me.kaspiPhone) {
    await resyncReceiverBills(c.get('deps'), me.id);
  }
  return c.json<MeDto>(await meDto(c, u, await activeMemberships(db, c.env, u)));
});

async function membersOf(db: Db, env: Env, communityId: number, userId?: number): Promise<MemberDto[]> {
  const rows = await db
    .select({ m: memberships, u: users })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.active, true), eq(memberships.communityId, communityId), userId === undefined ? undefined : eq(memberships.userId, userId)));
  return rows
    .map(({ m, u }) => ({ userId: u.id, displayName: u.displayName, role: effectiveRole(env, u, m), level: m.level }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
}

// Group management: the group comes from `?communityId=` (scopeCommunity in routes.ts).
membersApi.get('/members', requireRole('organizer'), async c =>
  c.json(await membersOf(c.get('deps').db, c.env, c.get('community').id)),
);

membersApi.patch(
  '/members/:userId',
  requireRole('admin'),
  body(z.object({ role: z.enum(['organizer', 'player']).optional(), displayName: name.optional() }).strict()),
  async c => {
    const userId = idParam(c.req.param('userId'));
    const communityId = c.get('community').id;
    const { db } = c.get('deps');
    const v = c.req.valid('json');
    const target = userId === null ? [] : await membersOf(db, c.env, communityId, userId);
    if (!target.length) return c.json({ error: 'not_found' }, 404);
    // The name is shared by all groups: it is checked against everyone who shares a group with the target.
    if (v.displayName !== undefined && (await nameTaken(db, v.displayName, userId!))) return c.json({ error: 'name_taken' }, 409);
    if (v.role !== undefined)
      await db.update(memberships).set({ role: v.role }).where(and(eq(memberships.communityId, communityId), eq(memberships.userId, userId!)));
    if (v.displayName !== undefined) await db.update(users).set({ displayName: v.displayName }).where(eq(users.id, userId!));
    return c.json((await membersOf(db, c.env, communityId, userId!))[0]);
  },
);
