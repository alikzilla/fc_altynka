import { contextForStartParam, routeForStartParam } from '../src/lib/startParam';

test('routeForStartParam', () => {
  expect(routeForStartParam('e12')).toBe('/event/12');
  expect(routeForStartParam('g12')).toBe('/event/12/guest');
  expect(routeForStartParam('b12')).toBe('/event/12?tab=bill');
  expect(routeForStartParam('zzz')).toBe('/');
  expect(routeForStartParam('e')).toBe('/');
  expect(routeForStartParam(undefined)).toBe('/');
});

test('team section links preserve explicit team context', () => {
  expect(routeForStartParam('c7_matches')).toBe('/matches');
  expect(routeForStartParam('c7_payments')).toBe('/notifications');
  expect(contextForStartParam('c7_settings')).toEqual({ joinCommunityId: 7, route: '/profile' });
  expect(contextForStartParam('c7_matches')).toEqual({ joinCommunityId: 7, route: '/matches' });
  expect(contextForStartParam('b12')).toEqual({ route: '/event/12?tab=bill' });
  expect(contextForStartParam('c0_matches')).toEqual({ route: '/' });
});

test.each([
  ['matches', '/matches'], ['payments', '/notifications'], ['settings', '/profile'], ['newmatch', '/new'],
  ['t12', '/event/12?tab=teams'],
  ['r12', '/event/12/review'],
])('bot link %s opens %s', (param, route) => {
  expect(routeForStartParam(param)).toBe(route);
});

test.each(['e0', 'g0', 'b0', 't0', 'r0', 'r-1', 'r1.5', 'r9007199254740992', 'r12/more', 'e-1', 't1.5', 'e9007199254740992', 'e12?tab=bill', 't12/more'])('rejects invalid event link %s', param => {
  expect(routeForStartParam(param)).toBe('/');
});
