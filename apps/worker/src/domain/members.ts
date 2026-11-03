import { defaultDisplayName, type Role } from '@sbor/core';
import { and, eq, inArray } from 'drizzle-orm';
import type { TgWebAppUser } from '../auth/initData';
import type { Db } from '../db/client';
import { communities, events, memberships, users, type CommunityRow, type EventRow, type MembershipRow, type UserRow } from '../db/schema';
import type { Env } from '../env';

export async function getCommunity(db: Db): Promise<CommunityRow | null> {
  return (await db.select().from(communities).limit(1))[0] ?? null;
}

/** Открытые сборы: пока они есть, переносить бота в другую группу нельзя — их сообщения остались в прежней. */
export async function openEvents(db: Db, communityId: number): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(and(eq(events.communityId, communityId), inArray(events.status, ['collecting', 'scheduled', 'billing'])));
}

/** В MVP сообщество одно: создаём или переносим на новый чат. При переносе все заново подтверждают членство. */
export async function bindCommunity(db: Db, tgChatId: number, title: string): Promise<CommunityRow> {
  const existing = await getCommunity(db);
  if (existing) {
    const [row] = await db.update(communities).set({ tgChatId, title }).where(eq(communities.id, existing.id)).returning();
    if (existing.tgChatId !== tgChatId) {
      await db.update(memberships).set({ checkedAt: 0 }).where(eq(memberships.communityId, existing.id));
    }
    return row;
  }
  const [row] = await db.insert(communities).values({ tgChatId, title }).returning();
  return row;
}

const nameKey = (n: string) => n.trim().toLocaleLowerCase('ru');

async function takenNames(db: Db, exceptUserId?: number): Promise<Set<string>> {
  const rows = await db.select({ id: users.id, displayName: users.displayName }).from(users);
  return new Set(rows.filter(r => r.id !== exceptUserId).map(r => nameKey(r.displayName)));
}

/** Имя уже у кого-то другого (без учёта регистра): в списках и счёте их было бы не различить. */
export async function nameTaken(db: Db, name: string, exceptUserId?: number): Promise<boolean> {
  return (await takenNames(db, exceptUserId)).has(nameKey(name));
}

/** 'Данияр' занято → 'Данияр 2', затем 'Данияр 3'… */
function freeName(taken: Set<string>, base: string): string {
  if (!taken.has(nameKey(base))) return base;
  for (let n = 2; ; n++) if (!taken.has(nameKey(`${base} ${n}`))) return `${base} ${n}`;
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
      displayName: freeName(await takenNames(db), defaultDisplayName(u.first_name, u.last_name)),
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
  await db.update(communities).set({ tgChatId: toChatId }).where(eq(communities.tgChatId, fromChatId));
}

/** checkedAt — членство только что подтверждено (Telegram ответил или человек нажал кнопку в группе). */
export async function ensureMembership(db: Db, communityId: number, userId: number, checkedAt?: number): Promise<MembershipRow> {
  const insert = db.insert(memberships).values({ communityId, userId, checkedAt: checkedAt ?? 0 });
  await (checkedAt === undefined
    ? insert.onConflictDoNothing()
    : insert.onConflictDoUpdate({ target: [memberships.communityId, memberships.userId], set: { checkedAt } }));
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
