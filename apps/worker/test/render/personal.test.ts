import type { EventView } from '../../src/render/eventMessage';
import { personalAwards } from '../../src/render/personal';

const env = { BOT_USERNAME: 'altynka_bot', MINIAPP_SHORT_NAME: 'app' };
const view: EventView = {
  id: 5, date: '2026-11-07', status: 'closed', startTime: '21:00', durationHours: 2, place: 'Шанырак', comment: null,
  limit: 15, main: [], reserve: [], communityTitle: 'Футбол по субботам',
} as EventView;

test('a single MVP: title without gender, votes, numbers, progress, button to the match', () => {
  const r = personalAwards(env, view, { seed: '1:5', awards: [{ award: 'mvp', votes: 6, sharedWith: [] }],
    stats: { goals: 3, assists: 2, games: 5, wins: 4 }, progress: [{ ladder: 'mvp', total: 3, raised: null, nextTier: 'silver', remaining: 2 }] });
  expect(r.html.startsWith('Футбол по субботам\n\n')).toBe(true);
  expect(r.html).toContain('<b>🏆 MVP матча — это ты · ');
  expect(r.html).toContain('За тебя проголосовали 6 партнёров.');
  expect(r.html).toContain('За матч: 3 гола, 2 паса, 4 победы в 5 играх.');
  expect(r.html).toContain('Это твоя 3-я награда MVP. До серебра — ещё 2.');
  expect(r.keyboard?.inline_keyboard[0][0]).toMatchObject({ text: 'Посмотреть награды', url: expect.stringContaining(`startapp=e${view.id}`) });
});

test('two awards: counted title and a list; a shared award names the partner', () => {
  const r = personalAwards(env, view, { seed: '1:5', awards: [{ award: 'mvp', votes: 6, sharedWith: [] }, { award: 'forward', votes: 3, sharedWith: ['Дамир'] }], stats: null, progress: [] });
  expect(r.html).toContain('Две награды за матч');
  expect(r.html).toContain('MVP матча — 6 голосов');
  expect(r.html).toContain('Лучший нападающий — 3 голоса');
  expect(r.html).toContain('Награда на двоих: ты и Дамир.');
  expect(r.html).not.toContain('За матч:');
  expect(r.html).not.toContain('проголосовали');
});

test('a new tier is announced instead of the distance to it; numbers without passes', () => {
  const r = personalAwards(env, view, { seed: '1:5', awards: [{ award: 'goalkeeper', votes: 2, sharedWith: [] }], stats: { goals: 0, assists: null, games: 4, wins: 1 },
    progress: [{ ladder: 'position-best', total: 1, raised: 'wood', nextTier: 'bronze', remaining: 4 }] });
  expect(r.html).toContain('Лучший вратарь матча — ты');
  expect(r.html).toContain('Новый уровень: «Лучший на позиции», дерево.');
  expect(r.html).not.toContain('До бронзы');
  expect(r.html).toContain('За матч: 0 голов, 1 победа в 4 играх.');
});

test('names are escaped and the top of the ladder has no distance', () => {
  const r = personalAwards(env, view, { seed: '2:9', awards: [{ award: 'defender', votes: 2, sharedWith: ['A&B', 'Ерлан'] }], stats: null,
    progress: [{ ladder: 'position-best', total: 120, raised: null, nextTier: null, remaining: null }] });
  expect(r.html).toContain('Награда на троих: ты, A&amp;B и Ерлан.');
  expect(r.html).toContain('Это твоя 120-я награда на позиции.');
  expect(r.html).not.toMatch(/До |ещё/);
});
