import { env } from 'cloudflare:test';
import { getDb } from '../src/db/client';
import { communities, memberships, users, type CommunityRow, type UserRow } from '../src/db/schema';
import type { TgWebAppUser } from '../src/auth/initData';

export const db = () => getDb(env.DB);

let nextTgId = 1000;

export async function seedCommunity(): Promise<CommunityRow> {
  const [row] = await db().insert(communities).values({ tgChatId: -100500, title: 'Футбол' }).returning();
  return row;
}

export async function seedUser(
  name: string,
  opts: { role?: 'organizer' | 'player'; level?: number; tgId?: number; communityId?: number } = {},
): Promise<UserRow> {
  const [u] = await db()
    .insert(users)
    .values({ tgId: opts.tgId ?? nextTgId++, firstName: name, displayName: name, createdAt: 0 })
    .returning();
  if (opts.communityId !== undefined) {
    await db()
      .insert(memberships)
      .values({ communityId: opts.communityId, userId: u.id, role: opts.role ?? 'player', level: opts.level ?? 5 });
  }
  return u;
}

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

/** Подписывает initData так же, как Telegram. */
export async function signInitData(user: TgWebAppUser, botToken: string, authDateSec: number): Promise<string> {
  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  params.set('auth_date', String(authDateSec));
  const dcs = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  params.set('hash', hex(await hmac(secret, dcs)));
  return params.toString();
}
