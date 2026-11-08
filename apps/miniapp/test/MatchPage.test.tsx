import type { EventDetailDto, MeDto } from '@altynka/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { App } from '../src/App';
import { queryClient, resourceKey } from '../src/lib/queryClient';

const signup = { id: 1, seq: 1, userId: 2, name: 'Айдос Нуспеков', invitedByUserId: null, guestOfName: null };
let me: MeDto;
let ev: EventDetailDto;
let requests: string[];
let finishJoin: (() => void) | undefined;
let delayJoin: boolean;
beforeEach(() => {
  me = { userId: 2, displayName: 'Айдос Нуспеков', kaspiPhone: null, communities: [{ id: 1, title: 'FC Altynka', role: 'player' }] };
  ev = { id: 7, community: { id: 1, title: 'FC Altynka' }, viewerRole: 'player', date: '2026-11-08', status: 'scheduled', startTime: '20:00', durationHours: 2, place: 'Arena Football · Абая, 150', comment: 'Берём две футболки', limit: 15, mainCount: 0, reserveCount: 0, my: null, main: [], reserve: [], teams: null, bill: null };
  ev.serverNow=Date.parse('2026-11-08T05:00:00Z');
  requests = []; delayJoin = false; finishJoin = undefined;
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/me') return Response.json(me);
    if (path === '/api/notifications') return Response.json({ tasks: [] });
    if (path === '/api/events/7') return Response.json(ev);
    if (init?.method) {
      requests.push(`${init.method} ${path}`);
      if (path.endsWith('/join')) {
        if (delayJoin) await new Promise<void>(resolve => { finishJoin = resolve; });
        ev = { ...ev, my: 'main', main: [signup], mainCount: 1 };
        return Response.json({ kind: 'main', position: 1 });
      }
      return Response.json({ kind: 'ok' });
    }
    throw new Error(`Unexpected ${path}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());
function open(tab = 'list') {
  const loc = memoryLocation({ path: `/event/7?tab=${tab}`, record: true });
  return { ...render(<Router hook={loc.hook} searchHook={loc.searchHook}><App /></Router>), loc };
}

test.each(['list', 'teams', 'bill'])('participation is available in the shared card on %s', async tab => {
  open(tab);
  expect(await screen.findByText('Ты пока не записан')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Иду' }).closest('.match-action')).not.toBeNull();
  expect(screen.queryByRole('list', { name: 'Этапы матча' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '8 ноября' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Участники' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Оплата' })).toBeVisible();
});

test('the match card names its group even for a single-group player', async () => {
  open();
  const card = await screen.findByRole('region', { name: 'Матч и твоё участие' });
  expect(within(card).getByText('FC Altynka')).toBeVisible();
});

test('«Добавить друга» opens a bottom sheet over the match instead of a new screen', async () => {
  ev.status = 'collecting';
  const { loc } = open();
  await userEvent.click(await screen.findByRole('button', { name: 'Добавить друга' }));
  expect(await screen.findByRole('dialog', { name: 'Привести друга' })).toBeVisible();
  expect(loc.history.at(-1)).toBe('/event/7?tab=list');
});

test('full roster explicitly offers reserve', async () => {
  ev.mainCount = 15;
  open();
  expect(await screen.findByRole('button', { name: 'Встать в резерв' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Иду' })).not.toBeInTheDocument();
});

test('reserve status includes the actual position on every tab', async () => {
  ev.my = 'reserve'; ev.reserve = [{ ...signup, id: 4, userId: 99 }, signup];
  open('teams');
  expect(await screen.findByText('Ты в резерве · №2')).toBeVisible();
  await userEvent.click(screen.getByRole('tab', { name: 'Оплата' }));
  expect(screen.getByText('Ты в резерве · №2')).toBeVisible();
});

test('changing participation opens an explicit exit without leaving on the first tap', async () => {
  ev.my = 'main'; ev.main = [signup]; ev.mainCount = 1;
  open('teams');
  await userEvent.click(await screen.findByRole('button', { name: 'Изменить' }));
  const dialog = screen.getByRole('dialog', { name: 'Твоё участие' });
  expect(within(dialog).getByText(/Место в основе освободится/)).toBeVisible();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Остаюсь' }));
  expect(screen.queryByRole('dialog', { name: 'Твоё участие' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Изменить' }));
  expect(requests).toEqual([]);
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Твоё участие' })).getByRole('button', { name: 'Не иду, выйти из списка' }));
  await waitFor(() => expect(requests).toContain('POST /api/events/7/leave'));
});

test('participation request stays locked when changing tabs', async () => {
  delayJoin = true;
  open();
  await userEvent.click(await screen.findByRole('button', { name: 'Иду' }));
  await userEvent.click(screen.getByRole('tab', { name: 'Составы' }));
  expect(screen.getByRole('button', { name: 'Записываем…' })).toBeDisabled();
  expect(requests).toEqual(['POST /api/events/7/join']);
  await act(async () => finishJoin?.());
  expect(await within(screen.getByRole('region', { name: 'Матч и твоё участие' })).findByText('Ты в основе')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Иду' })).not.toBeInTheDocument();
});

test('organizer scheduling has priority over own signup', async () => {
  me.communities[0].role = 'organizer'; ev.viewerRole = 'organizer'; ev.status = 'collecting'; ev.startTime = null; ev.durationHours = null;
  open();
  const schedule = await screen.findByRole('link', { name: 'Назначить матч' });
  expect(schedule.closest('.match-action')).not.toBeNull();
  expect(schedule).toHaveAttribute('href', '/event/7/schedule');
  expect(screen.getByRole('button', { name: 'Иду' }).closest('.match-action')).toBeNull();
});

test('organizer menu owns match cancellation and keeps it separate from participation', async () => {
  me.communities[0].role = 'organizer'; ev.viewerRole = 'organizer'; ev.my = 'main'; ev.main = [signup];
  open();
  await userEvent.click(await screen.findByRole('button', { name: 'Действия матча' }));
  const dialog = screen.getByRole('dialog', { name: 'Действия матча' });
  expect(within(dialog).getByRole('link', { name: 'Изменить время и поле' })).toHaveAttribute('href', '/event/7/schedule');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Отменить матч' }));
  expect(requests).toEqual([]);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Точно отменить матч?' }));
  await waitFor(() => expect(requests).toContain('POST /api/events/7/cancel'));
});

test('player does not see organizer actions', async () => {
  open();
  await screen.findByText('Ты пока не записан');
  expect(screen.queryByRole('button', { name: 'Действия матча' })).not.toBeInTheDocument();
});

test('failed background profile refresh preserves the open bill draft', async () => {
  me.communities[0].role = 'organizer'; ev.viewerRole = 'organizer'; ev.status = 'playing'; ev.main = [signup]; ev.mainCount = 1;
  open('bill');
  await userEvent.click(await screen.findByRole('button', { name: 'Выставить счёт' }));
  await userEvent.type(screen.getByLabelText('Аренда поля, ₸'), '4000');
  vi.mocked(fetch).mockImplementation(async path => {
    if (path === '/api/me') throw new Error('offline');
    if (path === '/api/events/7') return Response.json(ev);
    return Response.json({ tasks: [] });
  });
  await act(async () => { await queryClient.invalidateQueries({ queryKey: resourceKey('/api/me') }); });
  expect(screen.getByRole('dialog', { name: 'Выставить счёт' })).toBeVisible();
  expect(screen.getByLabelText('Аренда поля, ₸')).toHaveValue(4000);
});

// /api/me works without groups: only 401 (no Telegram session) is an authorization failure.
test.each([401])('profile refresh with explicit authorization failure %s blocks cached access', async status => {
  open();
  await screen.findByText('Ты пока не записан');
  vi.mocked(fetch).mockImplementation(async path => path === '/api/me'
    ? Response.json({ error: 'forbidden' }, { status })
    : Response.json({ tasks: [] }));
  await act(async () => { await queryClient.invalidateQueries({ queryKey: resourceKey('/api/me') }); });
  expect(screen.queryByText('Ты пока не записан')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeVisible();
});

test('organizer in another group gets no organizer controls when viewerRole is player', async () => {
  me.communities = [{ id: 1, title: 'FC Altynka', role: 'player' }, { id: 2, title: 'Другая', role: 'organizer' }];
  ev.viewerRole = 'player'; ev.status = 'collecting'; ev.startTime = null; ev.durationHours = null;
  open();
  await screen.findByRole('button', { name: 'Иду' });
  expect(screen.queryByRole('button', { name: 'Действия матча' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Назначить матч' })).toBeNull();
});
