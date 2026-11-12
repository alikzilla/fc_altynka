import { addDays, todayAlmaty, type AvailabilityDto, type AvailabilitySummaryDto } from '@altynka/core';
import { communities } from '../../src/db/schema';
import { apiRequest, db } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
let today: string;
beforeEach(async () => { w = await setupApiWorld(); today = todayAlmaty(new Date(w.clock.now)); });
afterEach(teardownApiWorld);

const put = (path: string, body: unknown, as = w.player) => apiRequest(path, { as, method: 'PUT', body });

// Часы мира — суббота 7 ноября 2026: неделя со 2-го по 8-е, отмечать можно субботу и воскресенье.
test('the calendar is the current week from Monday; days before today are past', async () => {
  const dto = await (await apiRequest('/api/availability', { as: w.player })).json<AvailabilityDto>();
  expect(dto.days.map(d => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  expect(dto.days.map(d => d.past)).toEqual([true, true, true, true, true, false, false]);
  expect(dto.days[5]).toEqual({ date: today, mark: null, past: false });
  expect(dto.markedThisWeek).toBe(false);
});

test('a day is marked with time windows, changed and cleared', async () => {
  const tomorrow = addDays(today, 1);
  let dto = await (await put(`/api/availability/days/${tomorrow}`, { mark: { status: 'yes', parts: ['night', 'evening', 'night'] } })).json<AvailabilityDto>();
  expect(dto.days[6]).toEqual({ date: tomorrow, mark: { status: 'yes', parts: ['evening', 'night'] }, past: false });
  expect(dto.days[5].mark).toBeNull();
  dto = await (await put(`/api/availability/days/${tomorrow}`, { mark: { status: 'no', parts: ['noon'] } })).json<AvailabilityDto>();
  expect(dto.days[6].mark).toEqual({ status: 'no', parts: [] });
  dto = await (await put(`/api/availability/days/${tomorrow}`, { mark: null })).json<AvailabilityDto>();
  expect(dto.days.every(d => d.mark === null)).toBe(true);
});

test('a mark stays visible after its day has passed, but can no longer be changed', async () => {
  await put(`/api/availability/days/${today}`, { mark: { status: 'yes', parts: ['evening'] } });
  w.clock.now += 86_400_000;
  const dto = await (await apiRequest('/api/availability', { as: w.player })).json<AvailabilityDto>();
  expect(dto.days[5]).toEqual({ date: today, mark: { status: 'yes', parts: ['evening'] }, past: true });
  expect((await put(`/api/availability/days/${today}`, { mark: null })).status).toBe(400);
});

test('invalid input is rejected', async () => {
  expect((await put(`/api/availability/days/${addDays(today, -1)}`, { mark: { status: 'yes', parts: ['evening'] } })).status).toBe(400);
  // Следующая неделя начинается в понедельник: её пока не отмечают.
  expect((await put(`/api/availability/days/${addDays(today, 2)}`, { mark: { status: 'yes', parts: ['evening'] } })).status).toBe(400);
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
  // Сводка — оставшиеся дни недели: суббота и воскресенье.
  expect(dto.days).toHaveLength(2);
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

test('marking a day counts for the whole week, from Monday to Sunday by Almaty time', async () => {
  // 7 ноября 2026 — суббота. Отметка сделана сейчас: до конца недели просьба не нужна.
  let dto = await (await put(`/api/availability/days/${today}`, { mark: { status: 'no' } })).json<AvailabilityDto>();
  expect(dto.markedThisWeek).toBe(true);
  w.clock.now = Date.parse('2026-11-08T18:59:00Z'); // воскресенье, 23:59 по Алматы
  dto = await (await apiRequest('/api/availability', { as: w.player })).json<AvailabilityDto>();
  expect(dto.markedThisWeek).toBe(true);
  expect(dto.days[5].mark).toEqual({ status: 'no', parts: [] });
  w.clock.now = Date.parse('2026-11-08T19:00:00Z'); // понедельник, 00:00 по Алматы
  dto = await (await apiRequest('/api/availability', { as: w.player })).json<AvailabilityDto>();
  expect(dto.markedThisWeek).toBe(false);
  expect(dto.days[0]).toEqual({ date: '2026-11-09', mark: null, past: false });
  expect(dto.days.every(d => d.mark === null)).toBe(true);
});
