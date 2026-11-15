import { describe, expect, it } from 'vitest';
import { AWARDS, AWARD_LABEL, AWARD_QUESTION, AWARD_SHORT_LABEL, awardWinners, emptyAwardCounts, normalizeAwardPicks } from '../src/awards';

const avg = (rows: [number, number][]) => new Map(rows);

describe('match awards', () => {
  it('gives the award to the player with most votes', () => {
    expect(awardWinners([{ award: 'mvp', userId: 1, votes: 4 }, { award: 'mvp', userId: 2, votes: 2 }], avg([])).mvp)
      .toEqual({ winners: [1], votes: 4 });
  });
  it('breaks a tie by the higher match average', () => {
    const r = awardWinners([{ award: 'defender', userId: 1, votes: 3 }, { award: 'defender', userId: 2, votes: 3 }], avg([[1, 7.5], [2, 8]]));
    expect(r.defender).toEqual({ winners: [2], votes: 3 });
  });
  it('shares the award when votes and averages are equal, winners sorted by id', () => {
    const r = awardWinners([{ award: 'forward', userId: 5, votes: 3 }, { award: 'forward', userId: 2, votes: 3 }], avg([[5, 8], [2, 8]]));
    expect(r.forward).toEqual({ winners: [2, 5], votes: 3 });
  });
  it('a player without ratings loses the tie to a rated one', () => {
    const r = awardWinners([{ award: 'mvp', userId: 1, votes: 2 }, { award: 'mvp', userId: 2, votes: 2 }], avg([[2, 4]]));
    expect(r.mvp).toEqual({ winners: [2], votes: 2 });
  });
  it('two unrated players on equal votes share', () => {
    expect(awardWinners([{ award: 'mvp', userId: 1, votes: 2 }, { award: 'mvp', userId: 2, votes: 2 }], avg([])).mvp?.winners).toEqual([1, 2]);
  });
  it('gives nothing below two votes and returns every key', () => {
    const r = awardWinners([{ award: 'goalkeeper', userId: 1, votes: 1 }], avg([]));
    expect(r).toEqual({ mvp: null, forward: null, midfielder: null, defender: null, goalkeeper: null });
  });
  it('a lower-voted player with a better average does not win', () => {
    const r = awardWinners([{ award: 'mvp', userId: 1, votes: 3 }, { award: 'mvp', userId: 2, votes: 2 }], avg([[1, 5], [2, 9]]));
    expect(r.mvp).toEqual({ winners: [1], votes: 3 });
  });
  it('normalizes picks to AWARDS order and drops an empty object', () => {
    expect(JSON.stringify(normalizeAwardPicks({ goalkeeper: 3, mvp: 2 }))).toBe('{"mvp":2,"goalkeeper":3}');
    expect(normalizeAwardPicks({})).toBeUndefined();
    expect(normalizeAwardPicks(undefined)).toBeUndefined();
  });
  it('has a label, a short label and a question for each award, and zero counts', () => {
    for (const key of AWARDS) expect([AWARD_LABEL[key], AWARD_SHORT_LABEL[key], AWARD_QUESTION[key]].every(Boolean)).toBe(true);
    expect(AWARD_LABEL.defender).toBe('Лучший защитник');
    expect(AWARD_QUESTION.defender).toBe('Кто лучше всех сыграл в обороне?');
    expect(emptyAwardCounts()).toEqual({ mvp: 0, forward: 0, midfielder: 0, defender: 0, goalkeeper: 0 });
  });
});
