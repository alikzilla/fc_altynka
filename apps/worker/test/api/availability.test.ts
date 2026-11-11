import { addDays, todayAlmaty, type AvailabilityDto, type AvailabilitySummaryDto } from '@altynka/core';
import { communities } from '../../src/db/schema';
import { apiRequest, db } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
let today: string;
beforeEach(async () => { w = await setupApiWorld(); today = todayAlmaty(new Date(w.clock.now)); });
afterEach(teardownApiWorld);

const put = (path: string, body: unknown, as = w.player) => apiRequest(path, { as, method: 'PUT', body });

test('an empty calendar is 7 unknown days starting today', async () => {
  const dto = await (await apiRequest('/api/availability', { as: w.player })).json<AvailabilityDto>();
  expect(dto.days).toHaveLength(7);
  expect(dto.days[0]).toEqual({ date: today, mark: null });
});

test('a day is marked with time windows, changed and cleared', async () => {
  const tomorrow = addDays(today, 1);
  let dto = await (await put(`/api/availability/days/${tomorrow}`, { mark: { status: 'yes', parts: ['night', 'evening', 'night'] } })).json<AvailabilityDto>();
  expect(dto.days[1]).toEqual({ date: tomorrow, mark: { status: 'yes', parts: ['evening', 'night'] } });
  expect(dto.days[2].mark).toBeNull();
  dto = await (await put(`/api/availability/days/${tomorrow}`, { mark: { status: 'no', parts: ['noon'] } })).json<AvailabilityDto>();
  expect(dto.days[1].mark).toEqual({ status: 'no', parts: [] });
  dto = await (await put(`/api/availability/days/${tomorrow}`, { mark: null })).json<AvailabilityDto>();
  expect(dto.days.every(d => d.mark === null)).toBe(true);
});

test('invalid input is rejected', async () => {
  expect((await put(`/api/availability/days/${addDays(today, -1)}`, { mark: { status: 'yes', parts: ['evening'] } })).status).toBe(400);
  expect((await put(`/api/availability/days/${addDays(today, 7)}`, { mark: { status: 'yes', parts: ['evening'] } })).status).toBe(400);
  expect((await put('/api/availability/days/soon', { mark: { status: 'yes', parts: ['evening'] } })).status).toBe(400);
  expect((await put(`/api/availability/days/${today}`, { mark: { status: 'maybe' } })).status).toBe(400);
  // «Могу» без времени не принимается.
  expect((await put(`/api/availability/days/${today}`, { mark: { status: 'yes' } })).status).toBe(400);
  expect((await put(`/api/availability/days/${today}`, { mark: { status: 'yes', parts: [] } })).status).toBe(400);
  expect((await put(`/api/availability/days/${today}`, { mark: { status: 'yes', parts: ['day'] } })).status).toBe(400);
  expect((await put('/api/availability/weekly', { weekly: [] })).status).toBe(404);
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
