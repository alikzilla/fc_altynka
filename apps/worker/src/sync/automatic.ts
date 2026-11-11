import { aggregatePlayerStatistics, matchStartsAt, playerAchievements, summarizePlayerProtocol } from '@altynka/core';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { matchParticipants, matchReviews, reviewSubmissions, users } from '../db/schema';
import { billDto, getBillByEvent } from '../domain/bills';
import { getEvent } from '../domain/events';
import { parseGameState } from '../domain/gameStore';
import { playerGameStatistics } from '../domain/playerStatistics';
import { getCommunity } from '../domain/members';
import type { Env } from '../env';
import type { Rendered } from '../render/eventMessage';
import { personalMatchReminder, personalPayment, personalResult, personalReviewInvitation } from '../render/personal';
import { TgRateLimited, type TgClient } from '../telegram/client';
import { nextDeliveryTime } from './automaticTime';
import { loadEventView } from './parts';
import { PersonalDelivery, REMINDER_GAP_MS } from './personal';

const MATCH_LEAD_MS = 2 * 3600_000;
const MAX_PAYMENT_REMINDERS = 3;
/** Личные итоги уходят сразу после завершения встречи; позже они уже не новость. */
const RESULT_WINDOW_MS = 12 * 3600_000;
interface AutomaticState { count: number; done: boolean; nextAt: number; }
interface Task { key: string; tgId: number; at: number; rendered: Rendered; payment: boolean; }
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
        for (const participant of participants) await append({
          key: `review:${review.closesAt}:${participant.tgId}`, tgId: participant.tgId, at,
          rendered: personalReviewInvitation(this.env, view, review.closesAt), payment: false,
        });
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
      if (!task || task.at > Date.now()) continue;
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
