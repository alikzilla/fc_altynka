import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  availabilityDays, bills, events, feedHidden, feedPosts, feedReactions, matchParticipants, matchReviews, memberships, signups,
  skillAssessments, users,
} from '../db/schema';
import { leaveEvent, type Deps } from './events';

/** Имя вместо удалённого человека везде, где он остаётся в истории. */
export const DELETED_NAME = 'Удалённый игрок';

export type DeleteResult = { kind: 'deleted' } | { kind: 'receiver_open_bill' } | { kind: 'not_found' };

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Заменить имена целыми словами: «Тимур» не задевает «Тимуровцы». Длинные имена раньше коротких. */
function scrubber(names: string[]) {
  const variants = [...new Set(names.map(n => n.trim()).filter(n => n.length >= 2 && n !== DELETED_NAME))].sort((a, b) => b.length - a.length);
  if (!variants.length) return (s: string) => s;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${variants.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  return (s: string) => s.replace(re, DELETED_NAME);
}

/** Пройти JSON: у объектов с этим `userId` имя заменить, в остальных строках — вычистить имена. */
function rewriteJson(json: string, userId: number, scrub: (s: string) => string): string {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return scrub(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
      if (o.userId === userId && typeof o.name === 'string') o.name = DELETED_NAME;
      return o;
    }
    return v;
  };
  return JSON.stringify(walk(JSON.parse(json)));
}

/**
 * «Удалить мои данные» (docs/superpowers/specs/2026-11-24-delete-my-data-design.md): профиль обезличивается и
 * отвязывается от Telegram, личное удаляется, история матчей остаётся под именем «Удалённый игрок».
 */
export async function deleteMyData(d: Deps, userId: number): Promise<DeleteResult> {
  const user = (await d.db.select().from(users).where(eq(users.id, userId)))[0];
  if (!user) return { kind: 'not_found' };
  if (user.deletedAt !== null) return { kind: 'deleted' };
  const receiving = await d.db.select({ id: bills.id }).from(bills).where(and(eq(bills.receiverUserId, userId), eq(bills.status, 'open'))).limit(1);
  if (receiving.length) return { kind: 'receiver_open_bill' };

  // Будущие записи — обычным выходом: резерв продвигается, сообщения группы обновляются. Закрытые матчи остаются.
  const active = await d.db.selectDistinct({ eventId: signups.eventId }).from(signups).where(and(eq(signups.userId, userId), isNull(signups.leftAt)));
  for (const { eventId } of active) await leaveEvent(d, eventId, userId);

  // Все имена, под которыми человек мог попасть в тексты и снимки.
  const participantNames = await d.db.selectDistinct({ name: matchParticipants.name }).from(matchParticipants).where(eq(matchParticipants.userId, userId));
  const reviews = await d.db.select({ eventId: matchReviews.eventId, roster: matchReviews.rosterJson }).from(matchReviews)
    .where(sql`${matchReviews.rosterJson} LIKE ${`%"userId":${userId}%`}`);
  const games = await d.db.select({ id: events.id, state: events.gameStateJson }).from(events)
    .where(sql`${events.gameStateJson} LIKE ${`%"userId":${userId}%`}`);
  const snapshotNames = [...reviews.map(r => r.roster), ...games.map(g => g.state ?? '')].flatMap(json => {
    const found: string[] = [];
    JSON.parse(json || 'null', (k, v) => { if (v && typeof v === 'object' && !Array.isArray(v) && v.userId === userId && typeof v.name === 'string') found.push(v.name); return v; });
    return found;
  });
  const scrub = scrubber([user.displayName, user.firstName, [user.firstName, user.lastName].filter(Boolean).join(' '), ...participantNames.map(p => p.name), ...snapshotNames]);

  const groups = (await d.db.select({ id: memberships.communityId }).from(memberships).where(eq(memberships.userId, userId))).map(m => m.id);
  const own = await d.db.select({ eventId: feedPosts.eventId, slot: feedPosts.slot }).from(feedPosts).where(eq(feedPosts.userId, userId));
  const others = groups.length ? await d.db.select().from(feedPosts).where(and(inArray(feedPosts.communityId, groups), or(isNull(feedPosts.userId), sql`${feedPosts.userId} <> ${userId}`))) : [];
  const ownKey = (t: typeof feedReactions | typeof feedHidden) => own.map(p => and(eq(t.eventId, p.eventId), eq(t.slot, p.slot)));

  const writes = [
    d.db.update(users).set({
      tgId: -userId, firstName: DELETED_NAME, displayName: DELETED_NAME, lastName: null, username: null, kaspiPhone: null, photoUrl: null,
      playingPosition: null, dominantFoot: null, pinnedAchievement: null, favoriteClub: null, profileCompletedAt: null, availabilityAskedOn: null,
      notificationsEnabled: false, pmAvailable: false, theme: 'dark', deletedAt: d.now,
    }).where(eq(users.id, userId)),
    d.db.delete(skillAssessments).where(eq(skillAssessments.userId, userId)),
    d.db.delete(availabilityDays).where(eq(availabilityDays.userId, userId)),
    d.db.delete(feedReactions).where(eq(feedReactions.userId, userId)),
    ...own.length ? [d.db.delete(feedReactions).where(or(...ownKey(feedReactions))), d.db.delete(feedHidden).where(or(...ownKey(feedHidden)))] : [],
    d.db.delete(feedPosts).where(eq(feedPosts.userId, userId)),
    d.db.update(memberships).set({ active: false, injured: false }).where(eq(memberships.userId, userId)),
    d.db.update(matchParticipants).set({ name: DELETED_NAME }).where(eq(matchParticipants.userId, userId)),
    ...reviews.map(r => d.db.update(matchReviews).set({ rosterJson: rewriteJson(r.roster, userId, scrub) }).where(eq(matchReviews.eventId, r.eventId))),
    ...games.map(g => d.db.update(events).set({ gameStateJson: rewriteJson(g.state!, userId, scrub) }).where(eq(events.id, g.id))),
    ...others.flatMap(p => {
      const text = scrub(p.text);
      const highlightsJson = rewriteJson(p.highlightsJson, userId, scrub);
      const payloadJson = p.payloadJson === null ? null : rewriteJson(p.payloadJson, userId, scrub);
      if (text === p.text && highlightsJson === JSON.stringify(JSON.parse(p.highlightsJson)) && payloadJson === (p.payloadJson && JSON.stringify(JSON.parse(p.payloadJson)))) return [];
      return [d.db.update(feedPosts).set({ text, highlightsJson, payloadJson }).where(eq(feedPosts.id, p.id))];
    }),
  ];
  await d.db.batch(writes as [typeof writes[number], ...typeof writes]);

  // Самообновляющиеся сообщения групп: пересобрать незакрытые матчи, где человек был.
  const touched = await d.db.selectDistinct({ id: events.id }).from(events).innerJoin(signups, eq(signups.eventId, events.id))
    .where(and(eq(signups.userId, userId), inArray(events.status, ['collecting', 'scheduled', 'billing'])));
  for (const { id } of touched) await d.sync.request(id, { parts: ['event', 'teams', 'bill'] });
  return { kind: 'deleted' };
}
