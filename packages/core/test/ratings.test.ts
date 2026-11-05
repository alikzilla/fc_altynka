import { describe, expect, it } from 'vitest';
import { calculatePlayerRating, formatRating, selfAssessmentRating, SKILLS } from '../src/ratings';

describe('player rating', () => {
  it('starts from the equally weighted eight skills without rounding the initial mean', () => {
    const answers = Object.fromEntries(SKILLS.map((s, i) => [s.key, i === 0 ? 7 : 6]));
    expect(selfAssessmentRating(answers as Parameters<typeof selfAssessmentRating>[0])).toBe(6.125);
    expect(calculatePlayerRating(6.125, [])).toBe(6.1);
    expect(calculatePlayerRating(6.25, [])).toBe(6.3);
    expect(formatRating(6.7)).toBe('6,7');
  });
  it('gives the initial assessment a weight of three games', () => {
    expect(calculatePlayerRating(6, [{ eventId: 1, completedAt: 1, score: 8, votes: 3 }])).toBe(6.5);
  });
  it('uses the ten most recent sufficient games, ordered by completion then id', () => {
    const games = Array.from({ length: 11 }, (_, i) => ({ eventId: i + 1, completedAt: i, score: i === 0 ? 1 : 8, votes: 3 }));
    expect(calculatePlayerRating(6, games.reverse())).toBe(7.5);
    expect(calculatePlayerRating(6, [...games, { eventId: 99, completedAt: 99, score: 1, votes: 2 }])).toBe(7.5);
  });
  it('bounds values and keeps extreme ratings', () => {
    expect(calculatePlayerRating(1, [])).toBe(1);
    expect(calculatePlayerRating(10, [])).toBe(10);
  });
});
