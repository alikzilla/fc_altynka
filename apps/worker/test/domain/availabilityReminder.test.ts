import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema';
import { saveDay, saveWeekly } from '../../src/domain/availability';
import { REMINDER_BATCH, sendAvailabilityReminders } from '../../src/domain/availabilityReminder';
import { TgForbidden, TgRateLimited } from '../../src/telegram/client';
import { FakeTg } from '../fakes/fakeTg';
import { db, seedCommunity, seedUser, setMemberProfile } from '../helpers';

const env = { BOT_USERNAME: 'fc_altynka_bot', MINIAPP_SHORT_NAME: 'app' };
// 2026-11-09 — понедельник; Алматы UTC+5.
const MONDAY_10 = Date.parse('2026-11-09T05:00:00Z');
let tg: FakeTg;
let communityId: number;
beforeEach(async () => { tg = new FakeTg(); communityId = (await seedCommunity()).id; });

async function subscriber(name: string, tgId: number, inGroup = true) {
  const u = await seedUser(name, { communityId: inGroup ? communityId : undefined, tgId });
  await setMemberProfile(u.id, { notificationsEnabled: true, pmAvailable: true });
  return u;
}
const run = (now = MONDAY_10) => sendAvailabilityReminders({ db: db(), now, tg, env });
const asked = async (id: number) => (await db().select().from(users).where(eq(users.id, id)))[0].availabilityAskedOn;

test('on Monday morning every subscriber is asked once, with a button to the calendar', async () => {
  const u = await subscriber('Тимур', 501);
  await seedUser('Без уведомлений', { communityId, tgId: 502 });
  await subscriber('Без группы', 503, false);
  expect(await run()).toEqual({ sent: 1, skipped: 0, failed: 0 });
  expect(tg.sent).toHaveLength(1);
  expect(tg.sent[0].chatId).toBe(501);
  expect(tg.sent[0].html).toContain('Когда сможешь играть на этой неделе?');
  expect(JSON.stringify(tg.sent[0].keyboard)).toContain('startapp=availability');
  expect(await asked(u.id)).toBe('2026-11-09');
  // Следующий прогон крона и остаток недели — тишина; через неделю — снова.
  await run(MONDAY_10 + 5 * 60_000);
  expect(tg.sent).toHaveLength(1);
  await run(MONDAY_10 + 7 * 86_400_000);
  expect(tg.sent).toHaveLength(2);
});

test.each([
  ['Monday before 9:00', Date.parse('2026-11-09T03:59:00Z')],
  ['Monday after 13:00', Date.parse('2026-11-09T08:00:00Z')],
  ['Tuesday morning', Date.parse('2026-11-10T05:00:00Z')],
  ['Sunday evening UTC that is not yet Monday 9:00 in Almaty', Date.parse('2026-11-08T20:00:00Z')],
])('nothing is sent on %s', async (_name, now) => {
  await subscriber('Тимур', 501);
  expect(await run(now)).toEqual({ sent: 0, skipped: 0, failed: 0 });
  expect(tg.sent).toHaveLength(0);
});

test('a fully marked week needs no reminder; a partly marked one does', async () => {
  const full = await subscriber('Всё отметил', 501);
  const pattern = await subscriber('График', 502);
  const partly = await subscriber('Один день', 503);
  for (let i = 0; i < 7; i++) await saveDay(db(), full.id, `2026-11-${String(9 + i).padStart(2, '0')}`, { status: i % 2 ? 'yes' : 'no', parts: [] }, 0);
  await saveWeekly(db(), pattern.id, Array.from({ length: 7 }, () => ({ status: 'yes' as const, parts: [] })));
  await saveDay(db(), partly.id, '2026-11-10', { status: 'no', parts: [] }, 0);
  expect(await run()).toEqual({ sent: 1, skipped: 2, failed: 0 });
  expect(tg.sent.map(m => m.chatId)).toEqual([503]);
  expect(await asked(full.id)).toBe('2026-11-09');
});

test('a big audience is covered in batches across cron runs without duplicates', async () => {
  for (let i = 0; i < REMINDER_BATCH + 3; i++) await subscriber(`Игрок ${i}`, 600 + i);
  expect((await run()).sent).toBe(REMINDER_BATCH);
  expect((await run(MONDAY_10 + 5 * 60_000)).sent).toBe(3);
  expect((await run(MONDAY_10 + 10 * 60_000)).sent).toBe(0);
  expect(new Set(tg.sent.map(m => m.chatId)).size).toBe(REMINDER_BATCH + 3);
});

test('a blocked bot is remembered; a rate limit leaves the rest for the next run', async () => {
  const blocked = await subscriber('Заблокировал', 501);
  await subscriber('Второй', 502);
  await subscriber('Третий', 503);
  const send = tg.sendMessage.bind(tg);
  let limited = true;
  tg.sendMessage = async (chatId, html, o) => {
    if (chatId === 501) throw new TgForbidden('blocked');
    if (chatId === 502 && limited) { limited = false; throw new TgRateLimited(3); }
    return send(chatId, html, o);
  };
  expect(await run()).toEqual({ sent: 0, skipped: 1, failed: 1 });
  expect((await db().select().from(users).where(eq(users.id, blocked.id)))[0].pmAvailable).toBe(false);
  expect(await run(MONDAY_10 + 5 * 60_000)).toEqual({ sent: 2, skipped: 0, failed: 0 });
  expect(tg.sent.map(m => m.chatId)).toEqual([502, 503]);
});
