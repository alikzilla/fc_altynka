import { env, runDurableObjectAlarm } from 'cloudflare:test';
import { startGameSession } from '../../src/domain/gameStart';
import { finishGameSession, recordGameResult } from '../../src/domain/games';
import { __setTgClientForTests } from '../../src/telegram/client';
import { gameFixture } from '../domain/gameFixture';
import type { FakeSync } from '../fakes/fakeSync';
import { FakeTg } from '../fakes/fakeTg';
import { setMemberProfile } from '../helpers';

let tg: FakeTg;
beforeEach(() => { tg = new FakeTg(); __setTgClientForTests(tg); });
afterEach(() => __setTgClientForTests(null));

test('after the match each subscribed player gets own goals and newly opened achievements, once', async () => {
  const w = await gameFixture(2);
  const [, scorer, quiet, silent] = w.people;
  for (const p of [scorer, quiet]) await setMemberProfile(p.id, { notificationsEnabled: true, pmAvailable: true });
  for (const p of w.people) tg.members.add(p.tgId);
  // Итоги уходят только по свежей встрече: игра начинается и завершается «сейчас».
  w.d.now = Date.now();
  await startGameSession(w.d, w.eventId, w.actorId, { requestId: 'start', expectedRevision: 0 });
  // scorer — второй в первой команде; quiet — третий там же.
  expect((await recordGameResult(w.d, w.eventId, w.actorId, { requestId: 'game', expectedRevision: 1 }, { score: [5, 0], scorers: [{ signupId: w.ids[1], goals: 5 }] })).kind).toBe('ok');
  expect((await finishGameSession(w.d, w.eventId, w.actorId, { requestId: 'finish', expectedRevision: 2 }, w.ids)).kind).toBe('ok');
  const request = (w.d.sync as FakeSync).calls.at(-1)!.req;
  expect(request.review).toBe(true);
  const stub = env.EVENT_SYNC.get(env.EVENT_SYNC.idFromName(`event:${w.eventId}`));
  const flush = async () => { await stub.request(w.eventId, request); await runDurableObjectAlarm(stub); };
  await flush();
  const results = (tgId: number) => tg.sent.filter(m => m.chatId === tgId && m.html.includes('Итоги матча'));
  expect(results(scorer.tgId)).toHaveLength(1);
  const html = results(scorer.tgId)[0].html;
  expect(html).toContain('Вот это игра: ты забил 5 голов!');
  expect(html).toContain('Короткие игры: 1 — 1 победа.');
  expect(html).toContain('Новое достижение: «Бомбардир», дерево.');
  expect(html).toContain('Новое достижение: «Хет-трик», дерево.');
  expect(html).toContain('На счету 5 голов.');
  expect(results(quiet.tgId)[0].html).toContain('Сегодня без голов.');
  expect(results(quiet.tgId)[0].html).toContain('«Победитель»');
  expect(results(quiet.tgId)[0].html).not.toContain('«Бомбардир»');
  expect(results(silent.tgId)).toHaveLength(0);
  await flush();
  expect(results(scorer.tgId)).toHaveLength(1);
});
