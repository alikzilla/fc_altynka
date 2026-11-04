import type { MeDto, Role } from '@altynka/core';
import { and, eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import type { CommunityRow, UserRow } from '../db/schema';
import { memberships, users } from '../db/schema';
import type { Deps } from '../domain/events';
import { effectiveRole, ensureMembership, getCommunity, upsertTgUser } from '../domain/members';
import type { Env } from '../env';
import { makeTgClient } from '../telegram/client';
import { verifyInitData } from './initData';

export interface AppEnv {
  Bindings: Env;
  Variables: { user: UserRow; role: Role; community: CommunityRow; deps: Deps; telegram: NonNullable<MeDto['telegram']> };
}

function httpsPhoto(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/** Раз в сутки спрашиваем Telegram, состоит ли человек ещё в группе. */
export const MEMBER_RECHECK_MS = 24 * 3600_000;

export function authMiddleware(makeDeps: (env: Env) => Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const raw = header.startsWith('tma ') ? header.slice(4) : '';
    const deps = makeDeps(c.env);
    const tgUser = raw ? await verifyInitData(raw, c.env.BOT_TOKEN, Math.floor(deps.now / 1000)) : null;
    if (!tgUser) return c.json({ error: 'unauthorized' }, 401);
    const community = await getCommunity(deps.db);
    if (!community) return c.json({ error: 'not_bound' }, 503);
    const user = await upsertTgUser(deps.db, tgUser, deps.now);
    if (tgUser.allows_write_to_pm === true && !user.pmAvailable) {
      await deps.db.update(users).set({ pmAvailable: true }).where(eq(users.id, user.id));
      user.pmAvailable = true;
    }
    let [m] = await deps.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.communityId, community.id), eq(memberships.userId, user.id)));
    const isAdmin = String(tgUser.id) === c.env.ADMIN_TG_ID;
    if (!isAdmin && (!m || deps.now - m.checkedAt > MEMBER_RECHECK_MS)) {
      if (!(await makeTgClient(c.env).isMember(community.tgChatId, tgUser.id))) {
        return c.json({ error: 'not_member' }, 403);
      }
      m = await ensureMembership(deps.db, community.id, user.id, deps.now);
    }
    if (!m) m = await ensureMembership(deps.db, community.id, user.id);
    c.set('user', user);
    c.set('telegram', {
      firstName: tgUser.first_name,
      lastName: tgUser.last_name ?? null,
      username: tgUser.username ?? null,
      photoUrl: httpsPhoto(tgUser.photo_url),
    });
    c.set('role', effectiveRole(c.env, user, m));
    c.set('community', community);
    c.set('deps', deps);
    await next();
  };
}

export function requireRole(min: 'organizer' | 'admin'): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const role = c.get('role');
    const ok = min === 'admin' ? role === 'admin' : role === 'organizer' || role === 'admin';
    if (!ok) return c.json({ error: 'forbidden' }, 403);
    await next();
  };
}
