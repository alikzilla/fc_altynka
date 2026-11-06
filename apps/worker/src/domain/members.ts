import { defaultDisplayName, type Role } from '@altynka/core';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { TgWebAppUser } from '../auth/initData';
import type { Db } from '../db/client';
import { communities, events, memberships, users, type CommunityRow, type EventRow, type MembershipRow, type UserRow } from '../db/schema';
import type { Env } from '../env';
import type { TgClient } from '../telegram/client';

export async function getCommunity(db: Db, id?: number): Promise<CommunityRow | null> {
  const rows = await db.select().from(communities).where(id === undefined ? undefined : eq(communities.id, id)).limit(2);
  return rows.length === 1 ? rows[0] : null;
}

export async function communityByChat(db: Db, chatId: number): Promise<CommunityRow | null> {
  return (await db.select().from(communities).where(eq(communities.tgChatId, chatId)))[0] ?? null;
}

/** Open matches in this community; connecting another chat never changes them. */
export async function openEvents(db: Db, communityId: number): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(and(eq(events.communityId, communityId), inArray(events.status, ['collecting', 'scheduled', 'billing'])));
}

/** A chat owns one stable community; connecting another chat never moves it. */
export async function bindCommunity(db: Db, tgChatId: number, title: string): Promise<CommunityRow> {
  const [row] = await db.insert(communities).values({ tgChatId, title }).onConflictDoUpdate({
    target: communities.tgChatId, set: { title, active: true },
  }).returning();
  return row;
}

const nameKey = (n: string) => n.trim().toLocaleLowerCase('ru');

/** Люди, с которыми есть общая группа, где оба активны (без самого человека). */
async function peers(db: Db, userId: number): Promise<{ id: number; displayName: string }[]> {
  // A join rather than bound id lists: a big group would exceed D1's bound-parameter limit.
  const mine = alias(memberships, 'mine');
  return db
    .selectDistinct({ id: memberships.userId, displayName: users.displayName })
    .from(mine)
    .innerJoin(communities, and(eq(communities.id, mine.communityId), eq(communities.active, true)))
    .innerJoin(memberships, and(eq(memberships.communityId, mine.communityId), eq(memberships.active, true)))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(mine.userId, userId), eq(mine.active, true), ne(memberships.userId, userId)));
}

export async function peerUserIds(db: Db, userId: number): Promise<number[]> {
  return (await peers(db, userId)).map(r => r.id);
}

/** Имя уже у кого-то из общих групп (без учёта регистра): в списках и счёте их было бы не различить. */
export async function nameTaken(db: Db, name: string, userId: number): Promise<boolean> {
  return (await peers(db, userId)).some(r => nameKey(r.displayName) === nameKey(name));
}

/** Создаёт пользователя или обновляет данные Telegram; отображаемое имя задаётся только при создании. */
export async function upsertTgUser(db: Db, u: TgWebAppUser, now: number): Promise<UserRow> {
  const tg = { firstName: u.first_name, lastName: u.last_name ?? null, username: u.username ?? null };
  const [known] = await db.select({ id: users.id }).from(users).where(eq(users.tgId, u.id));
  if (known) return (await db.update(users).set(tg).where(eq(users.id, known.id)).returning())[0];
  const [row] = await db
    .insert(users)
    .values({
      tgId: u.id,
      ...tg,
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

/** Группу превратили в супергруппу: у чата новый id. */
export async function moveCommunityChat(db: Db, fromChatId: number, toChatId: number): Promise<void> {
  await db.batch([
    db.update(communities).set({ tgChatId: toChatId }).where(eq(communities.tgChatId, fromChatId)),
    db.update(events).set({ telegramChatId: toChatId }).where(eq(events.telegramChatId, fromChatId)),
  ]);
}

/** checkedAt — членство только что подтверждено (Telegram ответил или человек нажал кнопку в группе). */
export async function ensureMembership(db: Db, communityId: number, userId: number, checkedAt?: number): Promise<MembershipRow> {
  const insert = db.insert(memberships).values({ communityId, userId, checkedAt: checkedAt ?? 0 });
  await (checkedAt === undefined
    ? insert.onConflictDoNothing()
    : insert.onConflictDoUpdate({ target: [memberships.communityId, memberships.userId], set: { checkedAt, active: true } }));
  const [row] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.communityId, communityId), eq(memberships.userId, userId)));
  return row;
}

export function effectiveRole(env: Pick<Env, 'ADMIN_TG_ID'>, user: UserRow, m: MembershipRow | null): Role {
  if (m?.active && m.telegramAdmin) return 'admin';
  return m?.role ?? 'player';
}

/** Always check current Telegram membership; admin privileges are never inferred from a global ID. */
export async function confirmedMembership(db: Db, tg: TgClient, community: CommunityRow, user: UserRow, now: number, legacyOwnerId?: string): Promise<MembershipRow | null> {
  if (!community.active) return null;
  const status = await tg.memberStatus(community.tgChatId, user.tgId);
  if (status === 'left') {
    await db.update(memberships).set({ active: false, telegramAdmin: false, checkedAt: 0, legacy: false })
      .where(and(eq(memberships.communityId, community.id), eq(memberships.userId, user.id)));
    return null;
  }
  const m = await ensureMembership(db, community.id, user.id, now);
  const [updated] = await db.update(memberships).set({ telegramAdmin: status === 'admin', legacy: false,
    ...(m.legacy && String(user.tgId) === legacyOwnerId && status !== 'admin' ? { role: 'organizer' as const } : {}),
  }).where(and(eq(memberships.communityId, community.id), eq(memberships.userId, user.id))).returning();
  return updated;
}

export interface MyMembership { community: CommunityRow; membership: MembershipRow; role: Role }

const byTitle = (a: MyMembership, b: MyMembership) => a.community.title.localeCompare(b.community.title, 'ru') || a.community.id - b.community.id;

/** Groups the person is in according to the database (no Telegram calls): active membership in an active group. */
export async function activeMemberships(db: Db, env: Pick<Env, 'ADMIN_TG_ID'>, user: UserRow): Promise<MyMembership[]> {
  const rows = await db.select({ community: communities, membership: memberships }).from(memberships)
    .innerJoin(communities, eq(communities.id, memberships.communityId))
    .where(and(eq(memberships.userId, user.id), eq(memberships.active, true), eq(communities.active, true)));
  return rows.map(r => ({ ...r, role: effectiveRole(env, user, r.membership) })).sort(byTitle);
}

/**
 * Same as activeMemberships, but every known membership (inactive included) is re-checked in Telegram.
 * Discovery only considers known memberships, never the global list of chats.
 */
export async function confirmedMemberships(db: Db, tg: TgClient, env: Pick<Env, 'ADMIN_TG_ID'>, user: UserRow, now: number): Promise<MyMembership[]> {
  const candidates = await db.select({ community: communities, stored: memberships }).from(memberships)
    .innerJoin(communities, eq(communities.id, memberships.communityId))
    .where(eq(memberships.userId, user.id));
  const settled = await Promise.allSettled(candidates.map(({ community }) => confirmedMembership(db, tg, community, user, now, env.ADMIN_TG_ID)));
  const checked = candidates.map(({ community, stored }, i): MyMembership | null => {
    const r = settled[i];
    // Telegram failed for this group: trust what the database already knows instead of failing the request.
    const membership = r.status === 'fulfilled' ? r.value : community.active && stored.active ? stored : null;
    if (r.status === 'rejected') console.warn(`Telegram membership check failed for community ${community.id}.`);
    return membership ? { community, membership, role: effectiveRole(env, user, membership) } : null;
  });
  return checked.filter((m): m is MyMembership => m !== null).sort(byTitle);
}
