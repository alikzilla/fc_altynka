import { addDays, todayAlmaty, weekdayOf, type AvailabilityDto, type AvailabilitySummaryDto } from '@altynka/core';
import { communities } from '../../src/db/schema';
import { apiRequest, db } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
let today: string;
beforeEach(async () => { w = await setupApiWorld(); today = todayAlmaty(new Date(w.clock.now)); });
afterEach(teardownApiWorld);

const put = (path: string, body: unknown, as = w.player) => apiRequest(path, { as, method: 'PUT', body });
const weeklyWith = (weekday: number, mark: unknown) => Array.from({ length: 7 }, (_, i) => i === weekday ? mark : null);

test('an empty calendar is 7 unknown days starting today', async () => {
  const dto = await (await apiRequest('/api/availability', { as: w.player })).json<AvailabilityDto>();
  expect(dto.weekly).toEqual([null, null, null, null, null, null, null]);
  expect(dto.days).toHaveLength(7);
  expect(dto.days[0]).toEqual({ date: today, mark: null, override: false });
});

test('the weekly pattern fills matching days; a date mark overrides it and can be cleared', async () => {
  const tomorrow = addDays(today, 1);
  const weekly = weeklyWith(weekdayOf(tomorrow), { status: 'yes', parts: ['evening', 'morning'] });
  let dto = await (await put('/api/availability/weekly', { weekly })).json<AvailabilityDto>();
  expect(dto.days[1]).toEqual({ date: tomorrow, mark: { status: 'yes', parts: ['morning', 'evening'] }, override: false });
  expect(dto.days[2].mark).toBeNull();

  dto = await (await put(`/api/availability/days/${tomorrow}`, { mark: { status: 'no', parts: ['day'] } })).json<AvailabilityDto>();
  expect(dto.days[1]).toEqual({ date: tomorrow, mark: { status: 'no', parts: [] }, override: true });
  expect(dto.days[2].override).toBe(false);

  dto = await (await put(`/api/availability/days/${tomorrow}`, { mark: null })).json<AvailabilityDto>();
  expect(dto.days[1]).toMatchObject({ mark: { status: 'yes' }, override: false });

  dto = await (await put('/api/availability/weekly', { weekly: weeklyWith(0, null) })).json<AvailabilityDto>();
  expect(dto.days.every(d => d.mark === null)).toBe(true);
});

test('invalid input is rejected', async () => {
  expect((await put(`/api/availability/days/${addDays(today, -1)}`, { mark: { status: 'yes' } })).status).toBe(400);
  expect((await put(`/api/availability/days/${addDays(today, 7)}`, { mark: { status: 'yes' } })).status).toBe(400);
  expect((await put('/api/availability/days/soon', { mark: { status: 'yes' } })).status).toBe(400);
  expect((await put(`/api/availability/days/${today}`, { mark: { status: 'maybe' } })).status).toBe(400);
  expect((await put('/api/availability/weekly', { weekly: [null] })).status).toBe(400);
  expect((await apiRequest('/api/availability', { as: null })).status).toBe(401);
});

test('the organizer sees names per day; a player and an outsider do not', async () => {
  const tomorrow = addDays(today, 1);
  await put(`/api/availability/days/${tomorrow}`, { mark: { status: 'yes', parts: ['evening'] } });
  await put(`/api/availability/days/${tomorrow}`, { mark: { status: 'no' } }, w.org);
  const path = `/api/availability/summary?communityId=${w.communityId}`;
  const dto = await (await apiRequest(path, { as: w.org })).json<AvailabilitySummaryDto>();
  expect(dto.days).toHaveLength(7);
  expect(dto.days[1]).toEqual({
    date: tomorrow,
    yes: [{ userId: w.playerUserId, name: 'Игрок', parts: ['evening'] }],
    no: [{ userId: w.orgUserId, name: 'Орг', parts: [] }],
    unknown: 1,
  });
  expect(dto.days[0]).toMatchObject({ yes: [], no: [], unknown: 3 });
  expect((await apiRequest(path, { as: w.player })).status).toBe(403);
  expect((await apiRequest('/api/availability/summary', { as: w.org })).status).toBe(403);
});

test('a foreign group is closed even to an organizer of another group', async () => {
  const [other] = await db().insert(communities).values({ tgChatId: -100777, title: 'Другая' }).returning();
  expect((await apiRequest(`/api/availability/summary?communityId=${other.id}`, { as: w.org })).status).toBe(403);
});
