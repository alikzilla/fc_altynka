import { AWARDS, aggregatePlayerStatistics, awardProgress, matchStartsAt, playerAchievements, summarizePlayerProtocol } from '@altynka/core';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { matchParticipants, matchReviews, reviewSubmissions, users } from '../db/schema';
import { awardsByEvent, playerAwardCounts } from '../domain/awards';
import { billDto, getBillByEvent } from '../domain/bills';
import { ceremonyWinners } from '../domain/feed';
import { getEvent } from '../domain/events';
import { parseGameState } from '../domain/gameStore';
import { playerGameStatistics } from '../domain/playerStatistics';
import { getCommunity } from '../domain/members';
import type { Env } from '../env';
import type { Rendered } from '../render/eventMessage';
import { personalAwards, personalMatchReminder, personalPayment, personalResult, personalReviewInvitation, personalReviewReminder } from '../render/personal';
import { TgRateLimited, type TgClient } from '../telegram/client';
import { nextDeliveryTime } from './automaticTime';
import { loadEventView } from './parts';
import { PersonalDelivery, REMINDER_GAP_MS } from './personal';

const MATCH_LEAD_MS = 2 * 3600_000;
const MAX_PAYMENT_REMINDERS = 3;
/** Личные итоги уходят сразу после завершения встречи; позже они уже не новость. */
const RESULT_WINDOW_MS = 12 * 3600_000;
/** Через столько после доставленного приглашения не ответившим уходит одно напоминание об опросе. */
export const REVIEW_REMINDER_DELAY_MS = 2 * 3600_000;
/** Напоминание, опоздавшее больше чем на час (объект долго не просыпался), уже не отправляется. */
const REVIEW_REMINDER_STALE_MS = 3600_000;
/** Поздравление с наградой, опоздавшее больше чем на сутки после закрытия опроса, уже не отправляется. */
const AWARD_WINDOW_MS = 24 * 3600_000;
/** Поздравления появились 23 ноября 2026: опросы, закрытые раньше, их не получают, даже если объект проснётся. */
export const CONGRATULATIONS_FROM = Date.UTC(2026, 10, 23, 19, 0);
interface AutomaticState { count: number; done: boolean; nextAt: number; }
/** `rendered: null` — только будильник: объект просыпается к этому времени и пересчитывает задачи. */
interface Task { key: string; tgId: number; at: number; rendered: Rendered | null; payment: boolean; }
const stateKey = (key: string) => `auto:state:${key}`;

/** Schedules are durable; candidates and message contents always come from current D1 data. */
export class AutomaticNotifications {
  /** Итоги считаются по всей истории игрока; один раз на прогон alarm. */
  private results = new Map<number, Rendered>();
  constructor(private db: Db, private env: Env, private tg: TgClient, private storage: DurableObjectStorage, private chatId: number) {}

  private async tasks(eventId: number): Promise<Task[]> {
    const now = Date.now();
    const event = await getEvent(this.db, eventId);
    if (!event || event.status === 'cancelled' || event.telegramChatId !== null && event.telegramChatId !== this.chatId) return [];
    if (!(await getCommunity(this.db, event.communityId))?.active) return [];
    const view = await loadEventView(this.db, eventId);
    if (!view) return [];
    const tasks: Task[] = [];
    const append = async (task: Task) => {
      const state = await this.storage.get<AutomaticState>(stateKey(task.key));
      if (state?.done || task.payment && (state?.count ?? 0) >= MAX_PAYMENT_REMINDERS) return;
      if (task.payment) {
        const lastReminder = await this.storage.get<number>(`reminder:${task.tgId}`);
        task.at = nextDeliveryTime(Math.max(task.at, state?.nextAt ?? 0, lastReminder === undefined ? 0 : lastReminder + REMINDER_GAP_MS, now));
      }
      tasks.push(task);
    };

    const kickoff = event.status === 'scheduled' && (event.protocolVersion === 0 || event.startedAt === null) ? matchStartsAt(event) : null;
    if (kickoff !== null && kickoff > now) {
      const recipients = new Map<number, { playing: boolean; guests: string[] }>();
      for (const person of view.main) {
        const tgId = person.tgId ?? person.guestOf?.tgId;
        if (tgId === undefined) continue;
        const recipient = recipients.get(tgId) ?? { playing: false, guests: [] };
        if (person.guestOf) recipient.guests.push(person.name);
        else recipient.playing = true;
        recipients.set(tgId, recipient);
      }
      for (const [tgId, recipient] of recipients) await append({
        key: `match:${kickoff}:${tgId}`, tgId, at: Math.max(now, kickoff - MATCH_LEAD_MS),
        rendered: personalMatchReminder(this.env, view, recipient.playing, recipient.guests), payment: false,
      });
    }

    const armedAt = await this.storage.get<number>('auto:billArmedAt');
    const rawBill = armedAt === undefined ? null : await getBillByEvent(this.db, eventId);
    if (rawBill?.status === 'open') {
      const bill = await billDto(this.db, rawBill.id);
      const [receiver] = await this.db.select().from(users).where(eq(users.id, rawBill.receiverUserId));
      for (const line of bill.lines.filter(l => l.due > 0)) {
        const [user] = await this.db.select().from(users).where(eq(users.id, line.userId));
        if (!user || !receiver) continue;
        await append({
          key: `payment:${bill.id}:${user.tgId}`, tgId: user.tgId,
          at: Math.max(armedAt!, rawBill.createdAt) + REMINDER_GAP_MS,
          rendered: personalPayment(this.env, view, bill, line, receiver.tgId, true), payment: true,
        });
      }
    }

    const state = event.protocolVersion === 1 && event.completedAt !== null && now < event.completedAt + RESULT_WINDOW_MS ? parseGameState(event) : null;
    if (state?.games.length && await this.storage.get<boolean>('auto:reviewArmed')) {
      const played = state.roster.flatMap(p => p.userId !== null && summarizePlayerProtocol(state, p.userId).games ? [p.userId] : []);
      const players = played.length ? await this.db.select({ id: users.id, tgId: users.tgId }).from(users).where(inArray(users.id, played)) : [];
      for (const player of players) {
        const key = `result:${event.completedAt}:${player.tgId}`;
        if ((await this.storage.get<AutomaticState>(stateKey(key)))?.done) continue;
        let rendered = this.results.get(player.tgId);
        if (!rendered) {
          // Достижения считаются по всем группам игрока, как в профиле: уровень «до» — без этой встречи.
          const { gameHistory } = await playerGameStatistics(this.db, player.id, player.id, now);
          const before = playerAchievements(aggregatePlayerStatistics(gameHistory.filter(row => row.eventId !== eventId)));
          const raised = playerAchievements(aggregatePlayerStatistics(gameHistory)).filter((a, i) => a.level > before[i].level);
          rendered = personalResult(this.env, view, summarizePlayerProtocol(state, player.id), raised);
          this.results.set(player.tgId, rendered);
        }
        await append({ key, tgId: player.tgId, at: now, rendered, payment: false });
      }
    }

    if (await this.storage.get<boolean>('auto:reviewArmed')) {
      const [review] = await this.db.select().from(matchReviews).where(eq(matchReviews.eventId, eventId));
      const at = nextDeliveryTime(now);
      if (review && at < review.closesAt) {
        const participants = await this.db.select({ tgId: users.tgId }).from(matchParticipants)
          .innerJoin(users, eq(users.id, matchParticipants.userId))
          .leftJoin(reviewSubmissions, and(eq(reviewSubmissions.eventId, matchParticipants.eventId), eq(reviewSubmissions.userId, matchParticipants.userId)))
          .where(and(eq(matchParticipants.eventId, eventId), isNull(reviewSubmissions.userId)));
        for (const participant of participants) {
          const inviteKey = `review:${review.closesAt}:${participant.tgId}`;
          await append({ key: inviteKey, tgId: participant.tgId, at, rendered: personalReviewInvitation(this.env, view, review.closesAt), payment: false });
          // Напоминаем только тем, до кого приглашение дошло; отсчёт от его отправки, тихие часы как у приглашения.
          const invited = await this.storage.get<AutomaticState>(stateKey(inviteKey));
          if (!invited?.count) continue;
          const remindAt = nextDeliveryTime(invited.nextAt - REMINDER_GAP_MS + REVIEW_REMINDER_DELAY_MS);
          if (remindAt < review.closesAt && now <= remindAt + REVIEW_REMINDER_STALE_MS) await append({
            key: `review-reminder:${review.closesAt}:${participant.tgId}`, tgId: participant.tgId, at: remindAt,
            rendered: personalReviewReminder(this.env, view, review.closesAt), payment: false,
          });
        }
      }
    }
    if (await this.storage.get<boolean>('auto:reviewArmed')) {
      const [review] = await this.db.select().from(matchReviews).where(eq(matchReviews.eventId, eventId));
      // До закрытия победителей не считаем: только просыпаемся к закрытию.
      if (review && now < review.closesAt) tasks.push({ key: `award-wake:${review.closesAt}`, tgId: 0, at: review.closesAt, rendered: null, payment: false });
      else if (review && review.closesAt >= CONGRATULATIONS_FROM && now < review.closesAt + AWARD_WINDOW_MS) {
        const result = (await awardsByEvent(this.db, [eventId])).get(eventId);
        const winners = result ? await ceremonyWinners({ db: this.db, now, sync: { request: async () => {} } }, eventId, result) : [];
        const ids = [...new Set(winners.map(w => w.userId))];
        const people = ids.length ? await this.db.select({ id: users.id, tgId: users.tgId }).from(users).where(inArray(users.id, ids)) : [];
        // От «сейчас», а не от закрытия: объект, проснувшийся поздно вечером, всё равно ждёт 10:00.
        const at = nextDeliveryTime(Math.max(review.closesAt, now));
        for (const person of people) {
          const key = `award:${review.closesAt}:${person.tgId}`;
          if (at > review.closesAt + AWARD_WINDOW_MS || (await this.storage.get<AutomaticState>(stateKey(key)))?.done) continue;
          const mine = winners.filter(w => w.userId === person.id);
          const names = new Map(winners.map(w => [w.userId, w.name]));
          const counts = await playerAwardCounts(this.db, person.id, person.id, now);
          const position = AWARDS.filter(a => a !== 'mvp');
          const wonMvp = mine.filter(w => w.award === 'mvp').length, wonPosition = mine.length - wonMvp;
          await append({ key, tgId: person.tgId, at, payment: false, rendered: personalAwards(this.env, view, {
            seed: `${eventId}:${person.tgId}`,
            awards: mine.map(w => ({ award: w.award, votes: w.votes, sharedWith: w.sharedWith.map(id => names.get(id) ?? 'Игрок') })),
            stats: mine[0].stats,
            progress: [
              ...(wonMvp ? [{ ladder: 'mvp' as const, ...awardProgress('mvp', counts.mvp, wonMvp) }] : []),
              ...(wonPosition ? [{ ladder: 'position-best' as const, ...awardProgress('position-best', position.reduce((sum, a) => sum + counts[a], 0), wonPosition) }] : []),
            ],
          }) });
        }
      }
    }
    return tasks;
  }

  async run(eventId: number): Promise<void> {
    const delivery = new PersonalDelivery(this.db, this.env, this.tg, this.storage, this.chatId);
    for (const candidate of await this.tasks(eventId)) {
      if (candidate.at > Date.now()) continue;
      // A previous recipient's Telegram request may have allowed payments, leaves or submissions.
      const task = (await this.tasks(eventId)).find(current => current.key === candidate.key);
      if (!task?.rendered || task.at > Date.now()) continue;
      const key = task.payment ? `pm:reminder:${task.tgId}` : `pm:auto:${task.key}`;
      const result = await delivery.automatic(task.tgId, key, task.rendered);
      if (result !== null) {
        const previous = await this.storage.get<AutomaticState>(stateKey(task.key));
        const now = Date.now();
        const state: AutomaticState = {
          count: (previous?.count ?? 0) + (result ? 1 : 0),
          done: !task.payment || !result,
          nextAt: now + REMINDER_GAP_MS,
        };
        await this.storage.put({
          [stateKey(task.key)]: state,
          ...(result && task.payment ? { [`reminder:${task.tgId}`]: now } : {}),
        });
      }
      if (delivery.error instanceof TgRateLimited) break;
    }
    if (delivery.error !== null) throw delivery.error;
  }

  async nextAt(eventId: number): Promise<number | null> {
    const tasks = await this.tasks(eventId);
    return tasks.length ? Math.min(...tasks.map(task => task.at)) : null;
  }
}
