import { expect, test } from 'vitest';
import { AWARDS, type AwardKey } from '../src/awards';
import { awardProgress, CEREMONY_TITLES, ceremonyLines, type CeremonyWinner } from '../src/ceremony';
import { composeCeremonyPost } from '../src/feed';

const A = { userId: 1, name: 'Алихан' }, B = { userId: 2, name: 'Дамир' }, C = { userId: 3, name: 'Ерлан' };
const stats = (goals: number, assists: number | null, wins = 1) => ({ goals, assists, games: 5, wins });
const w = (award: AwardKey, p: { userId: number; name: string }, extra: Partial<CeremonyWinner> = {}): CeremonyWinner =>
  ({ award, userId: p.userId, name: p.name, votes: 4, stats: null, sharedWith: [], ...extra });
const nameOf = (userId: number) => [A, B, C].find(p => p.userId === userId)!.name;

test('one card per winner in AWARDS order, signed by a single MVP', () => {
  for (let eventId = 1; eventId <= 20; eventId++) {
    const post = composeCeremonyPost({ eventId, date: '2026-11-14', winners: [w('defender', C), w('mvp', A, { votes: 6 }), w('forward', B)] })!;
    expect(post).toMatchObject({ kind: 'ceremony', slot: 'ceremony', userId: 1 });
    expect(post.payload!.map(c => [c.award, c.userId])).toEqual([['mvp', 1], ['forward', 2], ['defender', 3]]);
    expect(post.payload![0].votes).toBe(6);
    expect(post.payload!.every(c => c.text.includes(nameOf(c.userId)))).toBe(true);
    expect(CEREMONY_TITLES.mvp).toContain(post.payload![0].title);
    expect(CEREMONY_TITLES.defender).toContain(post.payload![2].title);
    expect([...post.highlights].sort()).toEqual(['Алихан', 'Дамир', 'Ерлан']);
  }
});

test('no MVP: unsigned, and the post text never says «MVP —»', () => {
  for (let eventId = 1; eventId <= 20; eventId++) {
    const post = composeCeremonyPost({ eventId, date: '2026-11-14', winners: [w('goalkeeper', A)] })!;
    expect(post.userId).toBeNull();
    expect(post.text).not.toContain('MVP —');
  }
});

test('a single MVP may be named in the post text, two MVPs leave it unsigned', () => {
  const texts = new Set<string>();
  for (let eventId = 1; eventId <= 30; eventId++) texts.add(composeCeremonyPost({ eventId, date: '2026-11-14', winners: [w('mvp', A)] })!.text);
  expect([...texts].some(t => t.includes('MVP — Алихан'))).toBe(true);
  expect([...texts].every(t => t.includes('14 ноября'))).toBe(true);
  const shared = composeCeremonyPost({ eventId: 1, date: '2026-11-14', winners: [w('mvp', A, { sharedWith: [2] }), w('mvp', B, { sharedWith: [1] })] })!;
  expect(shared.userId).toBeNull();
});

test('nobody won: no post', () => expect(composeCeremonyPost({ eventId: 1, date: '2026-11-14', winners: [] })).toBeNull());

test('number lines appear only when their condition holds', () => {
  expect(ceremonyLines('forward', { name: 'А', date: '2026-11-14', votes: 3, stats: stats(1, 0) }).some(l => l.includes('за вечер и лучший нападающий'))).toBe(false);
  expect(ceremonyLines('forward', { name: 'А', date: '2026-11-14', votes: 3, stats: stats(3, 0) }).some(l => l.includes('3 гола'))).toBe(true);
  expect(ceremonyLines('midfielder', { name: 'А', date: '2026-11-14', votes: 3, stats: stats(0, null) }).some(l => /\d+ пас/.test(l))).toBe(false);
  expect(ceremonyLines('midfielder', { name: 'А', date: '2026-11-14', votes: 3, stats: stats(0, 2) }).some(l => l.includes('2 паса'))).toBe(true);
  expect(ceremonyLines('mvp', { name: 'А', date: '2026-11-14', votes: 3, stats: stats(2, 1) }).some(l => l.includes('2 гола и 1 пас'))).toBe(true);
  expect(ceremonyLines('mvp', { name: 'А', date: '2026-11-14', votes: 3, stats: stats(3, null) }).some(l => l.includes('3 гола за вечер'))).toBe(true);
  expect(ceremonyLines('defender', { name: 'А', date: '2026-11-14', votes: 3, stats: stats(0, 0, 3) }).some(l => l.includes('3 победы'))).toBe(true);
  for (const award of AWARDS) {
    expect(ceremonyLines(award, { name: 'А', date: '2026-11-14', votes: 3, stats: null }).join(' ')).not.toMatch(/undefined|NaN|null/);
  }
});

test('two winners of one award get different phrasings; shared ids are kept', () => {
  for (let eventId = 1; eventId <= 20; eventId++) {
    const post = composeCeremonyPost({ eventId, date: '2026-11-14', winners: [w('defender', A, { sharedWith: [2] }), w('defender', B, { sharedWith: [1] })] })!;
    const [a, b] = post.payload!;
    expect(a.text.replace('Алихан', 'X')).not.toBe(b.text.replace('Дамир', 'X'));
    expect(a.sharedWith).toEqual([2]);
  }
});

test('no masculine past-tense verbs about a person in any template', () => {
  const all = AWARDS.flatMap(award => ceremonyLines(award, { name: 'А', date: '2026-11-14', votes: 3, stats: stats(4, 3, 4) }));
  // \b в JS не видит кириллицу, поэтому границы слова заданы явно.
  for (const line of all) expect(line).not.toMatch(/(^|[^а-яё])(забил|отдал|сыграл|получил|стал|провёл|сделал)([^а-яё]|$)/i);
});

test('award progress: new tier, next target, top of the ladder', () => {
  expect(awardProgress('mvp', 3, 1)).toEqual({ total: 3, raised: 'bronze', nextTier: 'silver', remaining: 2 });
  expect(awardProgress('mvp', 4, 1)).toEqual({ total: 4, raised: null, nextTier: 'silver', remaining: 1 });
  expect(awardProgress('position-best', 100, 1)).toMatchObject({ raised: 'legend', nextTier: null, remaining: null });
});

test('MVP number lines never say «0 голов» and never chain two «и»', () => {
  const passesOnly = ceremonyLines('mvp', { name: 'А', date: '2026-11-14', votes: 3, stats: stats(0, 3) });
  expect(passesOnly.some(l => l.includes('3 паса за вечер'))).toBe(true);
  expect(passesOnly.join(' ')).not.toContain('0 голов');
  const both = ceremonyLines('mvp', { name: 'А', date: '2026-11-14', votes: 3, stats: stats(2, 1) });
  expect(both).toContain('Цифры и голоса совпали: 2 гола, 1 пас и звание MVP. Это А.');
  expect(both.join(' ')).not.toContain('гола и 1 пас и звание');
});
