import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { App } from '../src/App';

const me = { userId: 1, displayName: 'Орг', role: 'organizer', kaspiPhone: '+77071234567', community: { id: 3, title: 'Футбол по субботам' } };
const signup = { id: 1, seq: 1, userId: 1, name: 'Орг', guestOfName: null, invitedByUserId: null };
const match = { id: 1, date: '2026-11-07', status: 'collecting', startTime: null, durationHours: null, place: null, limit: 10, mainCount: 1, reserveCount: 0, my: 'main', main: [signup], reserve: [], teams: null, bill: null, comment: null };
let role: string;
let status: string;
let createFails: boolean;
let created: boolean;
let submissions: unknown[];
let roster: typeof signup[];
let billSubmissions: { participantSignupIds: number[] }[];
beforeEach(() => {
  role = 'organizer'; status = 'collecting'; createFails = false; created = false; submissions = [];
  roster = [signup]; billSubmissions = [];
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/me') return Response.json({ ...me, role });
    if (path === '/api/notifications') return Response.json({ tasks: [] });
    if (path === '/api/events' && init?.method === 'POST') {
      submissions.push(JSON.parse(String(init.body)));
      if (createFails) return Response.json({ error: 'unavailable' }, { status: 503 });
      created = true;
      return Response.json({ id: 2 });
    }
    if (path === '/api/events') return Response.json({ active: created ? [{ ...match, id: 2, date: '2026-11-08' }] : [match], past: [] });
    if (path === '/api/matches') return Response.json({ events: [{ ...match, id: 9, date: '2026-10-31', status: 'closed' }], nextCursor: null });
    if (path === '/api/events/1') return Response.json({ ...match, status, main: roster, startTime: ['scheduled', 'playing'].includes(status) ? '21:00' : null, durationHours: ['scheduled', 'playing'].includes(status) ? 1 : null });
    if (path === '/api/events/1/bill') { billSubmissions.push(JSON.parse(String(init?.body))); return Response.json({ id: 1 }); }
    throw new Error(`Unexpected ${path}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());
function open(path = '/') {
  const loc = memoryLocation({ path, record: true });
  return { ...render(<Router hook={loc.hook} searchHook={loc.searchHook}><App /></Router>), loc };
}

test('creation opens over the current screen; failure preserves fields; success closes and shows active matches', async () => {
  const { loc } = open('/profile');
  await screen.findByRole('heading', { name: 'Профиль' });
  await userEvent.click(screen.getByRole('link', { name: 'Создать матч' }));
  const dialog = await screen.findByRole('dialog', { name: 'Новый матч' });
  expect(screen.getByRole('heading', { name: 'Профиль' })).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Группа')).toHaveValue('3');
  await userEvent.clear(within(dialog).getByLabelText('Дата'));
  await userEvent.type(within(dialog).getByLabelText('Дата'), '2026-11-08');
  await userEvent.type(within(dialog).getByLabelText(/Комментарий/), 'Берём мяч');
  createFails = true;
  await userEvent.click(within(dialog).getByRole('button', { name: 'Создать матч' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Не получилось создать матч');
  expect(within(dialog).getByLabelText(/Комментарий/)).toHaveValue('Берём мяч');
  createFails = false;
  await userEvent.click(within(dialog).getByRole('button', { name: 'Создать матч' }));
  expect(await screen.findByRole('heading', { name: 'Матчи' })).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Активные' })).toHaveAttribute('aria-selected', 'true');
  expect(await screen.findByRole('link', { name: /8 ноября/ })).toHaveAttribute('href', '/event/2');
  expect(loc.history?.at(-1)).toBe('/matches');
  expect(submissions).toEqual(Array(2).fill({ date: '2026-11-08', communityId: 3, comment: 'Берём мяч' }));
});

test('matches separates active signups from past bills and retains direct links', async () => {
  const { loc } = open('/matches');
  expect(await screen.findByRole('link', { name: /7 ноября/ })).toHaveAttribute('href', '/event/1');
  expect(screen.queryByRole('link', { name: /31 октября/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: 'Прошлые' }));
  expect(await screen.findByRole('link', { name: /31 октября/ })).toHaveAttribute('href', '/event/9');
  expect(screen.queryByRole('link', { name: /7 ноября/ })).not.toBeInTheDocument();
  expect(loc.history?.at(-1)).toBe('/matches?view=past');
});

test('creation preserves the past matches background tab when opened and closed', async () => {
  open('/matches?view=past');
  await screen.findByRole('link', { name: /31 октября/ });
  await userEvent.click(screen.getByRole('link', { name: 'Создать матч' }));
  await screen.findByRole('dialog');
  expect(screen.getByRole('tab', { name: 'Прошлые' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('link', { name: /31 октября/ })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Закрыть создание матча' }));
  expect(screen.getByRole('tab', { name: 'Прошлые' })).toHaveAttribute('aria-selected', 'true');
});

test('collecting bill tab explains prerequisite and links to appointment instead of showing a bill form', async () => {
  open('/event/1?tab=bill');
  expect(await screen.findByRole('link', { name: 'Назначить игру' })).toHaveAttribute('href', '/event/1/schedule');
  expect(screen.getByText('Сначала назначь игру')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Выставить счёт' })).not.toBeInTheDocument();
});

test.each(['billing', 'cancelled', 'closed'])('appointment URL is read-only for %s match', async value => {
  status = value;
  open('/event/1/schedule');
  expect(await screen.findByText('Изменить время уже нельзя')).toBeVisible();
  expect(screen.queryByLabelText('Начало')).not.toBeInTheDocument();
});

test('player cannot edit appointment through a direct URL', async () => {
  role = 'player';
  open('/event/1/schedule');
  expect(await screen.findByText('Игру назначает организатор')).toBeVisible();
  expect(screen.queryByLabelText('Начало')).not.toBeInTheDocument();
});

test('bill form retains entered amounts and excludes a participant who left during app return', async () => {
  status = 'playing';
  roster = [signup, { ...signup, id: 2, userId: 2, seq: 2, name: 'Второй' }];
  open('/event/1?tab=bill');
  await userEvent.click(await screen.findByRole('button', { name: 'Выставить счёт' }));
  await userEvent.type(await screen.findByLabelText('Аренда поля, ₸'), '4000');
  expect(screen.getByRole('checkbox', { name: 'Второй' })).toBeChecked();
  roster = [signup];
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Второй' })).not.toBeInTheDocument());
  expect(screen.getByLabelText('Аренда поля, ₸')).toHaveValue(4000);
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Выставить счёт' })).getByRole('button', { name: 'Выставить счёт' }));
  await waitFor(() => expect(billSubmissions).toHaveLength(1));
  expect(billSubmissions[0].participantSignupIds).toEqual([1]);
});
