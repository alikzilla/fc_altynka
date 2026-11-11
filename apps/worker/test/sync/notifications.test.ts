import { futureDate } from '../futureClock';
import { env, runDurableObjectAlarm } from 'cloudflare:test';
import { cancelEvent, createEvent, joinEvent, loadQueue, scheduleEvent } from '../../src/domain/events';
import { publishTeams, saveTeams } from '../../src/domain/teams';
import { ANNOUNCE_BATCH } from '../../src/sync/personal';
import { __setTgClientForTests } from '../../src/telegram/client';
import { FakeSync } from '../fakes/fakeSync';
import { FakeTg } from '../fakes/fakeTg';
import { db, seedCommunity, seedUser, setMemberProfile } from '../helpers';

let tg: FakeTg;
beforeEach(() => { tg = new FakeTg(); __setTgClientForTests(tg); });
afterEach(() => __setTgClientForTests(null));

async function world(subscribers = 1) {
  const c = await seedCommunity();
  const org = await seedUser('Азамат', { communityId: c.id, role: 'organizer', tgId: 101 });
  await setMemberProfile(org.id, { notificationsEnabled: true, pmAvailable: true });
  tg.members.add(101);
  const players = [];
  for (let i = 0; i < subscribers; i++) {
    const p = await seedUser(`Игрок ${i + 1}`, { communityId: c.id, tgId: 501 + i });
    await setMemberProfile(p.id, { notificationsEnabled: true, pmAvailable: true });
    tg.members.add(p.tgId);
    players.push(p);
  }
  const silent = await seedUser('Молчун', { communityId: c.id, tgId: 900 });
  tg.members.add(900);
  const d = { db: db(), now: Date.now(), sync: new FakeSync() };
  const ev = await createEvent(d, { communityId: c.id, date: futureDate(), comment: 'Берём манишки', createdBy: org.id });
  const stub = env.EVENT_SYNC.get(env.EVENT_SYNC.idFromName(`event:${ev}`));
  /** Передаёт в настоящий Durable Object последний запрос домена и выполняет alarm. */
  const flush = async () => { await stub.request(ev, d.sync.calls.at(-1)!.req); return runDurableObjectAlarm(stub); };
  const to = (tgId: number) => tg.sent.filter(m => m.chatId === tgId);
  return { c, org, players, silent, d, ev, stub, flush, to };
}

test('a new match is announced privately to subscribers with a signup button, once, and never to the creator', async () => {
  const w = await world();
  await w.flush();
  expect(w.to(501)).toHaveLength(1);
  expect(w.to(501)[0].html).toContain('Открыта запись');
  expect(w.to(501)[0].html).not.toContain('Берём манишки');
  expect(JSON.stringify(w.to(501)[0].keyboard)).toContain(`mj:${w.ev}:c`);
  expect(w.to(101)).toHaveLength(0);
  expect(w.to(900)).toHaveLength(0);
  // Группа получает только карточку матча: отдельного объявления нет.
  expect(tg.sent.filter(m => m.chatId < 0)).toHaveLength(1);
  await w.flush();
  expect(w.to(501)).toHaveLength(1);
});

test('a large announcement is delivered in batches across alarms without duplicates', async () => {
  const w = await world(ANNOUNCE_BATCH + 3);
  await w.flush();
  const privately = () => tg.sent.filter(m => m.chatId > 0);
  expect(privately()).toHaveLength(ANNOUNCE_BATCH);
  expect(await runDurableObjectAlarm(w.stub)).toBe(true);
  expect(privately()).toHaveLength(ANNOUNCE_BATCH + 3);
  expect(new Set(privately().map(m => m.chatId)).size).toBe(ANNOUNCE_BATCH + 3);
  expect(await runDurableObjectAlarm(w.stub)).toBe(false);
});

test('schedule, its change and cancellation reach signed-up subscribers privately', async () => {
  const w = await world(2);
  await joinEvent(w.d, w.ev, w.players[0].id);
  await scheduleEvent(w.d, w.ev, { startTime: '21:00', durationHours: 1, place: 'Шанырак' });
  await w.flush();
  const first = w.to(501).filter(m => m.html.includes('Игра назначена'));
  expect(first).toHaveLength(1);
  expect(first[0].html).toContain('21:00–22:00 · Шанырак');
  expect(first[0].html).toContain('Ты в основе.');
  // Второй подписчик не записан: личного сообщения о времени нет.
  expect(w.to(502).filter(m => m.html.includes('Игра назначена'))).toHaveLength(0);

  await scheduleEvent(w.d, w.ev, { startTime: '20:00', durationHours: 1, place: 'Шанырак' });
  await w.flush();
  const changed = w.to(501).filter(m => m.html.includes('Изменилось время'));
  expect(changed).toHaveLength(1);
  expect(changed[0].html).toContain('Теперь: 20:00–21:00');

  expect(await cancelEvent(w.d, w.ev)).toBe('ok');
  await w.flush();
  expect(w.to(501).filter(m => m.html.includes('Матч отменён'))).toHaveLength(1);
  expect(w.to(502).filter(m => m.html.includes('Матч отменён'))).toHaveLength(0);
  expect(tg.sent.filter(m => m.chatId < 0 && m.html.includes('Матч отменён'))).not.toHaveLength(0);
});

test('published teams tell each subscribed player their own team', async () => {
  const w = await world(1);
  await joinEvent(w.d, w.ev, w.org.id);
  await joinEvent(w.d, w.ev, w.players[0].id);
  const ids = (await loadQueue(db(), w.ev)).main.map(s => s.id);
  expect(await saveTeams(w.d, w.ev, { teamCount: 2, teams: [[ids[0]], [ids[1]]], guestLevels: {} })).toBe('ok');
  expect(await publishTeams(w.d, w.ev)).toBe('ok');
  await w.flush();
  const mine = w.to(501).filter(m => m.html.includes('Составы готовы'));
  expect(mine).toHaveLength(1);
  expect(mine[0].html).toMatch(/Ты играешь за .+\./);
  expect(mine[0].html).toContain('Азамат');
  expect(JSON.stringify(mine[0].keyboard)).toContain(`startapp=t${w.ev}`);
  await w.flush();
  expect(w.to(501).filter(m => m.html.includes('Составы готовы'))).toHaveLength(1);
});
