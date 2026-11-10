import { describe, expect, test } from 'vitest';
import { composeMatchFeed, composeTopRatedPost, composeUpcomingPost, FEED_MATCH_LIMIT, type FeedDraft } from '../src/feed';
import type { GameResult, GameRosterPlayer, GameState } from '../src/games';

const names = ['Айкын', 'Данияр', 'Ерлан', 'Тимур', 'Марат', 'Алишер'];
function match(teamCount: 2 | 3, games: Partial<GameResult>[], roster: GameRosterPlayer[] = names.map((name, i) => ({ signupId: i + 1, userId: i + 1, name, teamIndex: i % teamCount }))): GameState {
  return { teamCount, roster, initialPair: [0, 1], currentPair: [0, 1], receipts: [], finishParticipants: null,
    games: games.map((g, i) => ({ id: `g${i}`, sequence: i + 1, pair: [0, 1], score: [0, 0], scorers: [], firstRestTeamIndex: null, recordedAt: 0, recordedBy: 1, updatedAt: 0, updatedBy: 1, ...g })) };
}
const kinds = (posts: FeedDraft[]) => posts.map(p => p.kind);
const of = (posts: FeedDraft[], kind: string) => posts.find(p => p.kind === kind)!;

describe('composeMatchFeed', () => {
  test('no games, no news', () => {
    expect(composeMatchFeed({ eventId: 1, state: match(2, []) })).toEqual([]);
  });

  test('the winner leads, with the team colour and its name highlighted', () => {
    const posts = composeMatchFeed({ eventId: 1, colors: ['green', 'white'], state: match(2, [{ score: [2, 0] }, { score: [1, 0] }, { score: [0, 1] }]) });
    expect(posts[0]).toMatchObject({ kind: 'winner', slot: 'winner', teamColor: 'green', highlights: ['Зелёные'] });
    expect(posts[0].text).toContain('Зелёные');
    expect(kinds(posts)).toContain('summary');
  });

  test('a perfect winner is told as such and does not repeat as a streak', () => {
    const posts = composeMatchFeed({ eventId: 2, state: match(2, [{ score: [1, 0] }, { score: [2, 1] }, { score: [1, 0] }]) });
    expect(posts[0].variant).toBeGreaterThanOrEqual(10);
    expect(posts[0].variant).toBeLessThan(20);
    expect(kinds(posts)).not.toContain('streak');
  });

  test('equal points are settled by goals and both teams are named', () => {
    const posts = composeMatchFeed({ eventId: 3, state: match(2, [{ score: [3, 0] }, { score: [0, 1] }]) });
    expect(posts[0].highlights).toEqual(['Красные', 'Синие']);
    expect(posts[0].teamColor).toBe('red');
  });

  test('a fully level match has no winner', () => {
    const posts = composeMatchFeed({ eventId: 4, state: match(2, [{ score: [1, 0] }, { score: [0, 1] }]) });
    expect(posts[0]).toMatchObject({ kind: 'winner', teamColor: null });
    expect(posts[0].text).toContain('Красные и Синие');
  });

  test('hero, hat-trick, duo and blowout come from scorers and assists', () => {
    const state = match(2, [
      { score: [4, 0], scorers: [{ signupId: 1, goals: 2 }, { signupId: 3, goals: 2 }], assists: [{ scorerSignupId: 3, assistSignupId: 1, goals: 2 }] },
      { score: [1, 3], scorers: [{ signupId: 2, goals: 3 }, { signupId: 1, goals: 1 }], assists: [] },
    ]);
    const posts = composeMatchFeed({ eventId: 5, state });
    expect(of(posts, 'hero')).toMatchObject({ userId: 1, highlights: ['Айкын'] });
    expect(of(posts, 'hero').text).toContain('хет-трик и 2 передачи');
    expect(of(posts, 'hat_trick')).toMatchObject({ userId: 2, slot: 'hat_trick:2' });
    expect(of(posts, 'duo').highlights).toEqual(['Айкын', 'Ерлан']);
    expect(of(posts, 'blowout')).toMatchObject({ teamColor: 'red' });
    expect(of(posts, 'blowout').text).toContain('4:0');
    // The hero already owns the scoring story.
    expect(kinds(posts)).not.toContain('scorer');
    expect(posts.length).toBeLessThanOrEqual(FEED_MATCH_LIMIT);
  });

  test('a lone brace is the top-scorer story; a guest has no profile link', () => {
    const roster = [{ signupId: 1, userId: null, name: 'Гость Саша', teamIndex: 0 }, { signupId: 2, userId: 2, name: 'Данияр', teamIndex: 1 }];
    const posts = composeMatchFeed({ eventId: 6, state: match(2, [{ score: [2, 1], scorers: [{ signupId: 1, goals: 2 }, { signupId: 2, goals: 1 }] }, { score: [0, 0] }], roster) });
    expect(of(posts, 'scorer')).toMatchObject({ userId: null, highlights: ['Гость Саша'] });
  });

  test('three wins in a row by a team that did not win everything is a streak', () => {
    const posts = composeMatchFeed({ eventId: 7, state: match(2, [{ score: [0, 1] }, { score: [1, 0] }, { score: [1, 0] }, { score: [2, 1] }]) });
    expect(of(posts, 'streak')).toMatchObject({ teamColor: 'red' });
  });

  test('debut, achievement tier and scoring run need the group history', () => {
    const scoring = (goals: number) => match(2, [{ score: [goals, 0], scorers: goals ? [{ signupId: 1, goals }] : [] }, { score: [0, 0] }], names.slice(0, 4).map((name, i) => ({ signupId: i + 1, userId: i + 1, name, teamIndex: i % 2 })));
    const previous = [scoring(4), scoring(4)];
    const newcomer = scoring(2);
    newcomer.roster.push({ signupId: 9, userId: 9, name: 'Алишер', teamIndex: 1 });
    const posts = composeMatchFeed({ eventId: 8, state: newcomer, previous });
    expect(of(posts, 'debut')).toMatchObject({ userId: 9, slot: 'debut:9' });
    // 8 goals before, 10 after: bronze «Бомбардир».
    expect(of(posts, 'achievement')).toMatchObject({ userId: 1 });
    expect(of(posts, 'achievement').text).toMatch(/Бомбардир.*бронза|Бронза.*Бомбардир/s);
    expect(of(posts, 'scoring_run').text).toContain('3');
    expect(of(posts, 'winning_run')).toBeTruthy();
  });

  test('the first recorded match of a group does not greet everybody as a newcomer', () => {
    expect(kinds(composeMatchFeed({ eventId: 9, state: match(2, [{ score: [1, 0] }, { score: [0, 0] }]) }))).not.toContain('debut');
  });

  test('same match gives the same text; recently used phrasings are skipped', () => {
    const state = match(2, [{ score: [2, 0] }, { score: [1, 0] }, { score: [0, 1] }]);
    const first = composeMatchFeed({ eventId: 10, state });
    expect(composeMatchFeed({ eventId: 10, state })).toEqual(first);
    const seen = new Set<number>();
    let recent: number[] = [];
    for (let eventId = 1; eventId <= 5; eventId++) {
      const post = composeMatchFeed({ eventId, state, recent: { winner: recent } })[0];
      expect(recent.slice(0, 4)).not.toContain(post.variant);
      recent = [post.variant, ...recent];
      seen.add(post.variant);
    }
    expect(seen.size).toBe(5);
  });

  test('no post puts a name into an oblique case or a gendered past tense by template slip', () => {
    const state = match(3, [
      { pair: [0, 1], score: [5, 4], scorers: [{ signupId: 1, goals: 3 }, { signupId: 4, goals: 2 }, { signupId: 2, goals: 4 }], assists: [{ scorerSignupId: 1, assistSignupId: 4, goals: 3 }] },
      { pair: [0, 2], score: [3, 0], scorers: [{ signupId: 4, goals: 3 }], firstRestTeamIndex: 1 },
    ]);
    for (let eventId = 1; eventId <= 40; eventId++) for (const post of composeMatchFeed({ eventId, state })) {
      expect(post.text).not.toMatch(/undefined|NaN|null/);
      expect(post.text.trim()).toBe(post.text);
      for (const name of post.highlights) expect(post.text).toContain(name);
    }
  });
});

describe('other posts', () => {
  test('top rated: one or two leaders, never a crowd', () => {
    const one = composeTopRatedPost({ eventId: 1, date: '2026-11-07', winners: [{ userId: 3, name: 'Ерлан' }], score: 8.7 })!;
    expect(one).toMatchObject({ kind: 'top_rated', userId: 3, highlights: ['Ерлан'] });
    expect(one.text).toContain('8,7');
    expect(one.text).toContain('7 ноября');
    const two = composeTopRatedPost({ eventId: 1, date: '2026-11-07', winners: [{ userId: 3, name: 'Ерлан' }, { userId: 4, name: 'Тимур' }], score: 8 })!;
    expect(two).toMatchObject({ userId: null, highlights: ['Ерлан', 'Тимур'] });
    expect(composeTopRatedPost({ eventId: 1, date: '2026-11-07', winners: [], score: 8 })).toBeNull();
    expect(composeTopRatedPost({ eventId: 1, date: '2026-11-07', score: 8, winners: [1, 2, 3].map(userId => ({ userId, name: `Игрок ${userId}` })) })).toBeNull();
  });

  test('upcoming news carries the date, time, place and teams', () => {
    for (let eventId = 1; eventId <= 12; eventId++) {
      expect(composeUpcomingPost('signup_open', { eventId, date: '2026-11-07' }).text).toMatch(/суббота, 7 ноября/i);
      const scheduled = composeUpcomingPost('scheduled', { eventId, date: '2026-11-07', startTime: '21:00', place: 'Школа Аксай' }).text;
      expect(scheduled).toContain('21:00');
      expect(scheduled).toContain('Школа Аксай');
      expect(composeUpcomingPost('scheduled', { eventId, date: '2026-11-07', startTime: '21:00', place: null }).text).not.toMatch(/null|, \.|Поле/);
      expect(composeUpcomingPost('squad_full', { eventId, date: '2026-11-07', limit: 15 }).text).toMatch(/7 ноября/);
      const teams = composeUpcomingPost('teams_ready', { eventId, date: '2026-11-07', teamCount: 3, colors: ['red', 'blue', 'green'] });
      expect(teams.text).not.toContain('undefined');
      for (const name of teams.highlights) expect(['Красные', 'Синие', 'Зелёные']).toContain(name);
    }
  });
});
