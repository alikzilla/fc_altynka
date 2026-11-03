import { defaultDisplayName, type Role } from '@sbor/core';
import { and, eq } from 'drizzle-orm';
import type { TgWebAppUser } from '../auth/initData';
import type { Db } from '../db/client';
import { communities, memberships, users, type CommunityRow, type MembershipRow, type UserRow } from '../db/schema';
import type { Env } from '../env';

export async function getCommunity(db: Db): Promise<CommunityRow | null> {
  return (await db.select().from(communities).limit(1))[0] ?? null;
}

/** В MVP сообщество одно: создаём или переносим на новый чат. */
export async function bindCommunity(db: Db, tgChatId: number, title: string): Promise<CommunityRow> {
  const existing = await getCommunity(db);
  if (existing) {
    const [row] = await db.update(communities).set({ tgChatId, title }).where(eq(communities.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(communities).values({ tgChatId, title }).returning();
  return row;
}

/** Создаёт пользователя или обновляет данные Telegram; отображаемое имя задаётся только при создании. */
export async function upsertTgUser(db: Db, u: TgWebAppUser, now: number): Promise<UserRow> {
  const [row] = await db
    .insert(users)
    .values({
      tgId: u.id,
      firstName: u.first_name,
      lastName: u.last_name ?? null,
      username: u.username ?? null,
      displayName: defaultDisplayName(u.first_name, u.last_name),
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: users.tgId,
      set: { firstName: u.first_name, lastName: u.last_name ?? null, username: u.username ?? null },
    })
    .returning();
  return row;
}

export async function ensureMembership(db: Db, communityId: number, userId: number): Promise<MembershipRow> {
  await db.insert(memberships).values({ communityId, userId }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.communityId, communityId), eq(memberships.userId, userId)));
  return row;
}

export function effectiveRole(env: Pick<Env, 'ADMIN_TG_ID'>, user: UserRow, m: MembershipRow | null): Role {
  if (String(user.tgId) === env.ADMIN_TG_ID) return 'admin';
  return m?.role ?? 'player';
}
