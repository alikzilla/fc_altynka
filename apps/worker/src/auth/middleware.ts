import type { MeDto, Role } from '@altynka/core';
import { eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import type { CommunityRow, UserRow } from '../db/schema';
import { users } from '../db/schema';
import type { Deps } from '../domain/events';
import { confirmedMembership, effectiveRole, getCommunity, upsertTgUser } from '../domain/members';
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

export function identityMiddleware(makeDeps: (env: Env) => Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const raw = header.startsWith('tma ') ? header.slice(4) : '';
    const deps = makeDeps(c.env);
    const tgUser = raw ? await verifyInitData(raw, c.env.BOT_TOKEN, Math.floor(deps.now / 1000)) : null;
    if (!tgUser) return c.json({ error: 'unauthorized' }, 401);
    const user = await upsertTgUser(deps.db, tgUser, deps.now);
    if (tgUser.allows_write_to_pm === true && !user.pmAvailable) {
      await deps.db.update(users).set({ pmAvailable: true }).where(eq(users.id, user.id));
      user.pmAvailable = true;
    }
    c.set('user', user);
    c.set('telegram', {
      firstName: tgUser.first_name,
      lastName: tgUser.last_name ?? null,
      username: tgUser.username ?? null,
      photoUrl: httpsPhoto(tgUser.photo_url),
    });
    c.set('deps', deps);
    await next();
  };
}

/**
 * Object-scoped routes: the group comes from the object itself (or an explicit query parameter),
 * then membership and the role are checked in that group only.
 * `debtor` lets a person who has left the group still settle their own bill line (role `player`).
 */
export function scopeCommunity(
  resolve: (c: Context<AppEnv>) => Promise<number | null>,
  denied: 403 | 404 = 404,
  debtor?: (c: Context<AppEnv>) => Promise<boolean>,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const { db, now } = c.get('deps');
    const user = c.get('user');
    const id = await resolve(c);
    const community = id === null ? null : await getCommunity(db, id);
    const m = community ? await confirmedMembership(db, makeTgClient(c.env), community, user, now, c.env.ADMIN_TG_ID) : null;
    if (community && m) c.set('role', effectiveRole(c.env, user, m));
    else if (community && debtor && (await debtor(c))) c.set('role', 'player');
    else return c.json({ error: denied === 404 ? 'not_found' : 'not_member' }, denied);
    c.set('community', community);
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
