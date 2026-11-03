import { routeForStartParam } from '../src/startParam';

test('routeForStartParam', () => {
  expect(routeForStartParam('e12')).toBe('/event/12');
  expect(routeForStartParam('g12')).toBe('/event/12/guest');
  expect(routeForStartParam('b12')).toBe('/event/12?tab=bill');
  expect(routeForStartParam('zzz')).toBe('/');
  expect(routeForStartParam('e')).toBe('/');
  expect(routeForStartParam(undefined)).toBe('/');
});
