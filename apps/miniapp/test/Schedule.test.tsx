import type { EventDetailDto } from '@altynka/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { App } from '../src/App';
import { getBackAction } from '../src/lib/tg';
import { queryClient, resourceKey } from '../src/lib/queryClient';

let event: EventDetailDto;
let attempts: unknown[];
let fail: boolean;
let release: (() => void) | undefined;
let delay: boolean;
beforeEach(() => {
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
  await userEvent.click(await screen.findByRole('link', { name: 'Назначить игру' }));
  const sheet = await appointment();
  expect(screen.getByRole('heading', { name: '8 ноября' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Оплата' })).toHaveAttribute('aria-selected', 'true');
  await userEvent.clear(within(sheet).getByLabelText('Начало'));
  await userEvent.type(within(sheet).getByLabelText('Начало'), '22:30');
  await userEvent.click(within(sheet).getByRole('button', { name: /2 часа/ }));
  await chooseSchool(sheet);
  expect(within(sheet).getByLabelText('Начало')).toHaveValue('22:30');
  expect(within(sheet).getByRole('button', { name: /2 часа/ })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(within(sheet).getByRole('button', { name: 'Назначить игру' }));
  await waitFor(() => expect(attempts).toEqual([{ startTime: '22:30', durationHours: 2, place: 'Школа Аксай' }]));
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
  await userEvent.click(within(sheet).getByRole('button', { name: 'Назначить игру' }));
  await waitFor(() => expect(attempts).toEqual([{ startTime: '21:00', durationHours: 1, place: 'Arena · старое поле' }]));
});

test('save failure retains the venue and pending save blocks duplicate submission and Telegram Back', async () => {
  fail = true; open(); const sheet = await appointment(); await chooseSchool(sheet);
  await userEvent.click(within(sheet).getByRole('button', { name: 'Назначить игру' }));
  expect(await within(sheet).findByRole('alert')).toHaveTextContent('Не получилось назначить игру');
  expect(within(sheet).getByRole('button', { name: /Место проведения/ })).toHaveTextContent('Школа Аксай');
  fail = false; delay = true;
  await userEvent.click(within(sheet).getByRole('button', { name: 'Назначить игру' }));
  expect(within(sheet).getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
  expect(within(sheet).getByRole('button', { name: 'Закрыть' })).toBeDisabled();
  act(() => getBackAction()?.());
  expect(sheet).toBeInTheDocument(); expect(attempts).toHaveLength(2);
  await act(async () => release?.());
  await waitFor(() => expect(sheet).not.toBeInTheDocument());
});

test('late save response never navigates back after leaving the sheet', async () => {
  delay = true; const { loc } = open(); const sheet = await appointment();
  await userEvent.click(within(sheet).getByRole('button', { name: 'Назначить игру' }));
  act(() => loc.navigate('/matches'));
  await screen.findByRole('heading', { name: 'Матчи' });
  await act(async () => release?.());
  expect(loc.history?.at(-1)).toBe('/matches');
  expect(screen.queryByText('Игра назначена, группа получила уведомление')).not.toBeInTheDocument();
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
  event = { ...event, status: 'scheduled', startTime: '21:00', durationHours: 1 };
  open('/event/7');
  await userEvent.click(await screen.findByRole('button', { name: 'Действия матча' }));
  await userEvent.click(screen.getByRole('link', { name: 'Изменить время и поле' }));
  const sheet = await appointment();
  expect(screen.queryByRole('dialog', { name: 'Действия матча' })).not.toBeInTheDocument();
  await userEvent.click(within(sheet).getByRole('button', { name: 'Закрыть' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(document.body.style.overflow).not.toBe('hidden');
});
