import { shouldRefresh } from '../src/lib/queryClient';

test('a goal on the pitch refreshes the match and tasks, not the person or the player directory', () => {
  const write = '/api/events/7/games/results';
  expect(shouldRefresh(write, '/api/events/7')).toBe(true);
  expect(shouldRefresh(write, '/api/notifications')).toBe(true);
  expect(shouldRefresh(write, '/api/events')).toBe(true);
  expect(shouldRefresh(write, '/api/me')).toBe(false);
  expect(shouldRefresh(write, '/api/players/2')).toBe(false);
});

test('account writes and finished matches refresh everything', () => {
  for (const write of ['/api/me', '/api/me/skills', '/api/communities/3/join', '/api/events/7/games/finish', '/api/events/7/finish', '/api/events/7/review', '/api/events/7/bill']) {
    expect(shouldRefresh(write, '/api/me')).toBe(true);
    expect(shouldRefresh(write, '/api/players')).toBe(true);
  }
  expect(shouldRefresh(undefined, '/api/me')).toBe(true);
});
