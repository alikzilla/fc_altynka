import type { EventDetailDto, VenueDto } from '@altynka/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { App } from '../src/App';
import { getBackAction } from '../src/lib/tg';
import { queryClient, resourceKey } from '../src/lib/queryClient';

let event: EventDetailDto;
let venues: VenueDto[];
let venueCalls: { method: string; body?: unknown }[];
let attempts: unknown[];
let fail: boolean;
let release: (() => void) | undefined;
let delay: boolean;
beforeEach(() => {
  venues = [{ id: 1, name: 'Школа Аксай', address: null, mapUrl: 'https://go.2gis.com/G47G5', hourlyRate: null }]; venueCalls = [];
  attempts = []; fail = false; delay = false; release = undefined;
  event = { id: 7, community: { id: 1, title: 'FC Altynka' }, viewerRole: 'organizer', date: '2026-11-08', status: 'collecting', startTime: null, durationHours: null, place: null, limit: 10, mainCount: 0, reserveCount: 0, my: null, main: [], reserve: [], teams: null, bill: null, comment: null };
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/me') return Response.json({ userId: 1, displayName: 'Организатор', communities: [{ id: 1, title: 'FC Altynka', role: 'organizer' }], profileCompleted: true });
    if (path === '/api/notifications') return Response.json({ tasks: [] });
    if (path === '/api/events') return Response.json({ active: [event], past: [] });
    if (path === '/api/events/7/schedule') {
      const body = JSON.parse(String(init?.body)); attempts.push(body);
      if (fail) return Response.json({ error: 'offline' }, { status: 503 });
      if (delay) await new Promise<void>(resolve => { release = resolve; });
      event = { ...event, ...body, status: 'scheduled' };
      return Response.json({ kind: 'ok' });
    }
    if (path === '/api/events/7') return Response.json(event);
    if (path === '/api/venues?communityId=1') {
      if (init?.method !== 'POST') return Response.json({ venues });
      const body = JSON.parse(String(init.body)); venueCalls.push({ method: 'POST', body });
      if (venues.some(v => v.name === body.name)) return Response.json({ error: 'duplicate' }, { status: 409 });
      const venue = { id: venues.length + 1, ...body }; venues = [...venues, venue];
      return Response.json({ venue, venues });
    }
    if (path === '/api/venues/1' && init?.method === 'DELETE') { venueCalls.push({ method: 'DELETE' }); venues = venues.filter(v => v.id !== 1); return Response.json({ venues }); }
    throw new Error(`Unexpected ${path}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); document.body.style.overflow = ''; });
function open(path = '/event/7/schedule') {
  const loc = memoryLocation({ path, record: true });
  return { ...render(<Router hook={loc.hook} searchHook={loc.searchHook}><App /></Router>), loc };
}
async function appointment() { return (await screen.findByLabelText('Начало')).closest('dialog')!; }
async function chooseSchool(sheet: HTMLElement) {
  await userEvent.click(within(sheet).getByRole('button', { name: /Место проведения/ }));
  const picker = await screen.findByRole('dialog', { name: 'Место проведения' });
  expect(within(picker).getAllByRole('button', { pressed: true })).toHaveLength(1);
  expect(within(picker).getByRole('link', { name: 'Открыть в 2ГИС' })).toHaveAttribute('href', 'https://go.2gis.com/G47G5');
  expect(within(picker).queryByText('Пример')).not.toBeInTheDocument();
  await userEvent.click(within(picker).getByRole('button', { name: 'Выбрать площадку' }));
  await waitFor(() => expect(picker).not.toBeInTheDocument());
}

test('scheduling and venue selection overlay the same match, retain its tab and submit the selected school', async () => {
  const { loc } = open('/event/7?tab=bill');
  await userEvent.click(await screen.findByRole('link', { name: 'Назначить матч' }));
  const sheet = await appointment();
  expect(screen.getByRole('heading', { name: '8 ноября' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Оплата' })).toHaveAttribute('aria-selected', 'true');
  await userEvent.clear(within(sheet).getByLabelText('Начало'));
  await userEvent.type(within(sheet).getByLabelText('Начало'), '22:30');
  await userEvent.click(within(sheet).getByRole('button', { name: /2 часа/ }));
  await chooseSchool(sheet);
  expect(within(sheet).getByLabelText('Начало')).toHaveValue('22:30');
  expect(within(sheet).getByRole('button', { name: /2 часа/ })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(within(sheet).getByRole('button', { name: 'Назначить матч' }));
  await waitFor(() => expect(attempts).toEqual([{ startTime: '22:30', durationHours: 2, limit: 15, place: 'Школа Аксай' }]));
  await waitFor(() => expect(sheet).not.toBeInTheDocument());
  expect(loc.history?.at(-1)).toBe('/event/7?tab=bill');
});

test('background refresh does not overwrite the draft or school after returning from the map', async () => {
  open(); const sheet = await appointment();
  await userEvent.clear(within(sheet).getByLabelText('Начало'));
  await userEvent.type(within(sheet).getByLabelText('Начало'), '23:00');
  await chooseSchool(sheet);
  act(() => queryClient.setQueryData(resourceKey('/api/events/7'), { ...event, place: 'Старое поле', startTime: '20:00', durationHours: 2 }));
  expect(within(sheet).getByLabelText('Начало')).toHaveValue('23:00');
  expect(within(sheet).getByRole('button', { name: /Место проведения/ })).toHaveTextContent('Школа Аксай');
});

test('a legacy place survives saving without a replacement and closing the picker does not select a school', async () => {
  event.place = 'Arena · старое поле';
  open(); const sheet = await appointment();
  await userEvent.click(within(sheet).getByRole('button', { name: /Место проведения/ }));
  const picker = await screen.findByRole('dialog', { name: 'Место проведения' });
  await userEvent.click(within(picker).getByRole('button', { name: 'Закрыть' }));
  await waitFor(() => expect(picker).not.toBeInTheDocument());
  expect(within(sheet).getByRole('button', { name: /Место проведения/ })).toHaveTextContent('Arena · старое поле');
  await userEvent.click(within(sheet).getByRole('button', { name: 'Назначить матч' }));
  await waitFor(() => expect(attempts).toEqual([{ startTime: '21:00', durationHours: 1, limit: 10, place: 'Arena · старое поле' }]));
});

test('save failure retains the venue and pending save blocks duplicate submission and Telegram Back', async () => {
  fail = true; open(); const sheet = await appointment(); await chooseSchool(sheet);
  await userEvent.click(within(sheet).getByRole('button', { name: 'Назначить матч' }));
  expect(await within(sheet).findByRole('alert')).toHaveTextContent('Не получилось назначить матч');
  expect(within(sheet).getByRole('button', { name: /Место проведения/ })).toHaveTextContent('Школа Аксай');
  fail = false; delay = true;
  await userEvent.click(within(sheet).getByRole('button', { name: 'Назначить матч' }));
  expect(within(sheet).getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
  expect(within(sheet).getByRole('button', { name: 'Закрыть' })).toBeDisabled();
  act(() => getBackAction()?.());
  expect(sheet).toBeInTheDocument(); expect(attempts).toHaveLength(2);
  await act(async () => release?.());
  await waitFor(() => expect(sheet).not.toBeInTheDocument());
});

test('late save response never navigates back after leaving the sheet', async () => {
  delay = true; const { loc } = open(); const sheet = await appointment();
  await userEvent.click(within(sheet).getByRole('button', { name: 'Назначить матч' }));
  act(() => loc.navigate('/matches'));
  await screen.findByRole('heading', { name: 'Матчи' });
  await act(async () => release?.());
  expect(loc.history?.at(-1)).toBe('/matches');
  expect(screen.queryByText('Матч назначен, группа получила уведомление')).not.toBeInTheDocument();
});

test('Telegram Back dismisses only the venue picker and leaving both sheets restores body scrolling', async () => {
  document.body.style.overflow = 'auto';
  const { loc } = open(); const sheet = await appointment();
  await userEvent.click(within(sheet).getByRole('button', { name: /Место проведения/ }));
  const picker = await screen.findByRole('dialog', { name: 'Место проведения' });
  act(() => getBackAction()?.());
  await waitFor(() => expect(picker).not.toBeInTheDocument());
  expect(sheet).toBeInTheDocument();expect(document.body.style.overflow).toBe('hidden');
  await userEvent.click(within(sheet).getByRole('button', { name: /Место проведения/ }));
  await screen.findByRole('dialog', { name: 'Место проведения' });
  act(() => loc.navigate('/matches'));
  await screen.findByRole('heading', { name: 'Матчи' });
  expect(document.body.style.overflow).toBe('auto');
});

test('editing from the match menu replaces that menu and closing scheduling returns to the match', async () => {
  event = { ...event, date: '2099-11-08', status: 'scheduled', startTime: '21:00', durationHours: 1 };
  open('/event/7');
  await userEvent.click(await screen.findByRole('button', { name: 'Действия матча' }));
  await userEvent.click(screen.getByRole('link', { name: 'Изменить время и поле' }));
  const sheet = await appointment();
  expect(screen.queryByRole('dialog', { name: 'Действия матча' })).not.toBeInTheDocument();
  await userEvent.click(within(sheet).getByRole('button', { name: 'Закрыть' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(document.body.style.overflow).not.toBe('hidden');
});

test('the format sets the squad size: duration suggests it until the organizer picks one', async () => {
  open(); const sheet = await appointment();
  const format = (name: string) => within(sheet).getByRole('button', { name });
  expect(format('5×5, 10 игроков')).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(within(sheet).getByRole('button', { name: /2 часа/ }));
  expect(format('5×5×5, 15 игроков')).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(format('6×6, 12 игроков'));
  await userEvent.click(within(sheet).getByRole('button', { name: /1 час/ }));
  await userEvent.click(within(sheet).getByRole('button', { name: /2 часа/ }));
  expect(format('6×6, 12 игроков')).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(within(sheet).getByRole('button', { name: 'Назначить матч' }));
  await waitFor(() => expect(attempts).toEqual([{ startTime: '21:00', durationHours: 2, limit: 12 }]));
});

test('a scheduled match keeps its format when the duration changes', async () => {
  event = { ...event, date: '2099-11-08', status: 'scheduled', startTime: '21:00', durationHours: 2, limit: 18 };
  open(); const sheet = await appointment();
  expect(within(sheet).getByRole('button', { name: '6×6×6, 18 игроков' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(within(sheet).getByRole('button', { name: /1 час/ }));
  expect(within(sheet).getByRole('button', { name: '6×6×6, 18 игроков' })).toHaveAttribute('aria-pressed', 'true');
});

test('the organizer adds an indoor venue, it becomes the selection, and removes the old one', async () => {
  open(); const sheet = await appointment();
  await userEvent.click(within(sheet).getByRole('button', { name: /Место проведения/ }));
  let picker = await screen.findByRole('dialog', { name: 'Место проведения' });
  await userEvent.click(await within(picker).findByRole('button', { name: 'Добавить площадку' }));
  const form = await screen.findByRole('dialog', { name: 'Новая площадка' });
  await userEvent.type(within(form).getByLabelText('Название'), 'Школа Аксай');
  await userEvent.type(within(form).getByLabelText(/Ссылка на карту/), 'go.2gis.com/x');
  await userEvent.click(within(form).getByRole('button', { name: 'Добавить площадку' }));
  expect(await within(form).findByRole('alert')).toHaveTextContent('https://');
  await userEvent.clear(within(form).getByLabelText(/Ссылка на карту/));
  await userEvent.click(within(form).getByRole('button', { name: 'Добавить площадку' }));
  expect(await within(form).findByRole('alert')).toHaveTextContent('уже есть');
  await userEvent.clear(within(form).getByLabelText('Название'));
  await userEvent.type(within(form).getByLabelText('Название'), 'Манеж Арена');
  await userEvent.type(within(form).getByLabelText(/Адрес/), 'Толе би, 1');
  await userEvent.type(within(form).getByLabelText(/Цена за час/), '25000');
  await userEvent.click(within(form).getByRole('button', { name: 'Добавить площадку' }));
  picker = await screen.findByRole('dialog', { name: 'Место проведения' });
  expect(venueCalls.at(-1)).toEqual({ method: 'POST', body: { name: 'Манеж Арена', address: 'Толе би, 1', mapUrl: null, hourlyRate: 25000 } });
  expect(await within(picker).findByRole('button', { name: /Манеж Арена/, pressed: true })).toHaveTextContent('Толе би, 1');
  expect(within(picker).getByText(/25.000 ₸ \/ час/)).toBeInTheDocument();
  await userEvent.click(within(picker).getByRole('button', { name: 'Удалить площадку Школа Аксай' }));
  await userEvent.click(within(within(picker).getByRole('group', { name: /Удалить площадку Школа Аксай/ })).getByRole('button', { name: 'Удалить' }));
  await waitFor(() => expect(within(picker).queryByRole('button', { name: /^Школа Аксай/ })).not.toBeInTheDocument());
  await userEvent.click(within(picker).getByRole('button', { name: 'Выбрать площадку' }));
  await waitFor(() => expect(within(sheet).getByRole('button', { name: /Место проведения/ })).toHaveTextContent('Манеж Арена'));
});
