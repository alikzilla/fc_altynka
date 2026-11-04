import { routeForStartParam } from '../src/lib/startParam';

test('routeForStartParam', () => {
  expect(routeForStartParam('e12')).toBe('/event/12');
  expect(routeForStartParam('g12')).toBe('/event/12/guest');
  expect(routeForStartParam('b12')).toBe('/event/12?tab=bill');
  expect(routeForStartParam('zzz')).toBe('/');
  expect(routeForStartParam('e')).toBe('/');
  expect(routeForStartParam(undefined)).toBe('/');
});

test.each([
  ['matches', '/matches'], ['payments', '/notifications'], ['settings', '/profile'], ['newmatch', '/new'],
  ['t12', '/event/12?tab=teams'],
])('bot link %s opens %s', (param, route) => {
  expect(routeForStartParam(param)).toBe(route);
});

test.each(['e0', 'g0', 'b0', 't0', 'e-1', 't1.5', 'e9007199254740992', 'e12?tab=bill', 't12/more'])('rejects invalid event link %s', param => {
  expect(routeForStartParam(param)).toBe('/');
});
