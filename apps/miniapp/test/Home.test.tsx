import type { EventsListDto, EventSummaryDto } from '@altynka/core';
import { screen, waitFor, within } from '@testing-library/react';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { Home } from '../src/screens/Home';
import { NotificationsProvider } from '../src/state/notifications';
import userEvent from '@testing-library/user-event';
import { openTelegramLink } from '../src/lib/tg';
import { noGroups, organizer, player, renderWithApp, twoGroups } from './render';

vi.mock('../src/lib/api');
vi.mock('../src/lib/tg');

const ev: EventSummaryDto = {
  id: 5, community: { id: 1, title: 'FC Altynka' }, date: '2026-11-07', status: 'collecting', startTime: null, durationHours: null, place: null,
  limit: 10, mainCount: 9, reserveCount: 2, my: 'reserve', myReservePosition: 1,
};

beforeEach(() => {
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] } : { active: [ev], past: [] } satisfies EventsListDto));
});

test('the upcoming card leads with how soon the match is, then one line and two tags', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T09:00:00Z'));
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] }
    : { active: [{ ...ev, status: 'scheduled', startTime: '20:00', durationHours: 2, place: 'Школа Аксай' }], past: [] } satisfies EventsListDto));
  renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: player });
  const card = await screen.findByRole('article', { name: 'Матч суббота, 7 ноября' });
  expect(within(card).getByRole('heading', { name: 'суббота, 7 ноября' })).toBeInTheDocument();
  expect(within(card).getByText('Через 2 дня')).toBeInTheDocument();
  expect(within(card).getByText('20:00–22:00 · Школа Аксай')).toBeInTheDocument();
  expect(within(card).getByText('Ты в резерве · №1')).toBeInTheDocument();
  expect(within(card).getByLabelText('Записано 9 из 10, в резерве 2')).toHaveTextContent('9 / 10 · резерв 2');
  vi.useRealTimers();
});

test('Home shows unknown time and venue and offers no creation to players', async () => {
  renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: player });
  expect(await screen.findByRole('heading', { name: 'суббота, 7 ноября' })).toBeInTheDocument();
  expect(screen.getByText('Время уточняется · Поле уточняется')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Создать матч' })).toBeNull();
});

test.each([
  [{ my: 'main' as const }, '2026-11-07', 'Сегодня', 'Ты в основе'],
  [{ my: null }, '2026-11-06', 'Завтра', 'Запись открыта'],
  [{ my: null, status: 'playing' as const }, '2026-11-07', 'Идёт игра', 'Запись закрыта'],
])('upcoming card wording for %o on %s', async (patch, today, countdown, mine) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${today}T09:00:00Z`));
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] } : { active: [{ ...ev, ...patch, myReservePosition: null }], past: [] }));
  renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: player });
  const card = await screen.findByRole('article');
  expect(within(card).getByText(countdown)).toBeInTheDocument();
  expect(within(card).getByText(mine)).toBeInTheDocument();
  vi.useRealTimers();
});

test('organizers can create a match from the empty home state', async () => {
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] } : { active: [], past: [] }));
  renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: organizer });
  expect(await screen.findByText('Нет ближайших матчей')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Создать матч' })).toHaveAttribute('href', '/new');
});

test('empty home has one contextual action without decorative tiles or an empty tasks section', async () => {
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] } : { active: [], past: [] }));
  const { container } = renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: organizer });
  const action = await screen.findByRole('link', { name: 'Создать матч' });
  const empty = action.closest('.empty-state');
  expect(empty).not.toBeNull();
  expect(within(empty as HTMLElement).getByRole('link', { name: 'Создать матч' })).toHaveAttribute('href', '/new');
  expect(container.querySelector('.empty-icon')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Нужно сделать' })).not.toBeInTheDocument();
});

test('the big match cards carry no group tag, even with two groups', async () => {
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] } : { active: [ev, { ...ev, id: 6, community: { id: 2, title: 'Футбол по средам' } }], past: [] }));
  const { unmount } = renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: twoGroups });
  const cards = await screen.findAllByRole('article');
  expect(within(cards[0]).queryByText('FC Altynka')).toBeNull();
  expect(within(cards[1]).queryByText('Футбол по средам')).toBeNull();
  unmount();
  renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: player });
  await screen.findAllByRole('article');
  expect(screen.queryByText('FC Altynka')).toBeNull();
});

test('without groups the empty home explains how to connect the bot', async () => {
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] } : { active: [], past: [] }));
  renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: noGroups });
  expect(await screen.findByText(/Добавь бота в Telegram-группу/)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Создать матч' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Добавить в группу' }));
  expect(openTelegramLink).toHaveBeenCalled();
});

test('a match played yesterday leads Home with the player result, payment and survey', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-08T09:00:00Z'));
  const finished: EventSummaryDto = { ...ev, id: 9, date: '2026-11-07', status: 'billing', place: 'Arena', my: 'main', protocolVersion: 1, startedAt: 1, completedAt: 2,
    myResult: { teamIndex: 1, teamCount: 3, teamRank: 1, colors: ['red', 'blue', 'yellow'], games: 6, goals: 2, assists: 0, assistsTracked: false, wins: 4, draws: 1, losses: 1 } };
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications'
    ? { tasks: [{ kind: 'payment', id: 'p9', eventId: 9, billId: 3, date: '2026-11-07', place: 'Arena', due: 2000, receiverName: 'Орг', receiverKaspiPhone: '+77071234567', community: ev.community },
        { kind: 'review', id: 'r9', eventId: 9, date: '2026-11-07', place: 'Arena', closesAt: 0, community: ev.community }] }
    : { active: [finished], past: [] }));
  renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: player });
  const card = await screen.findByRole('article', { name: 'Синие — первое место' });
  expect(within(card).getByRole('heading', { name: '1 место' })).toBeInTheDocument();
  expect(within(card).getByText('Синие')).toBeInTheDocument();
  expect(within(card).getByText((_, el) => el?.tagName === 'P' && el.textContent === '4 победы · 1 ничья · 1 поражение')).toBeInTheDocument();
  expect(within(card).getByText('2 твоих гола')).toBeInTheDocument();
  expect(within(card).getByText('6 игр')).toBeInTheDocument();
  expect(within(card).getByRole('link', { name: /Таблица и бомбардиры/ })).toHaveAttribute('href', '/event/9?tab=games');
  expect(await within(card).findByRole('link', { name: /Оплатить 2\s000/ })).toHaveAttribute('href', '/event/9?tab=bill');
  expect(within(card).getByRole('link', { name: /Оценить матч/ })).toHaveAttribute('href', '/event/9/review');
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Последний матч');
  expect(screen.queryByRole('heading', { name: 'Нужно сделать' })).toBeNull();
  vi.useRealTimers();
});

test('list rows show the personal signup status', async () => {
  const later: EventSummaryDto = { ...ev, id: 6, date: '2026-11-14', my: 'main' };
  const third: EventSummaryDto = { ...ev, id: 7, date: '2026-11-21', my: null, mainCount: 4 };
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] } : { active: [ev, later, third], past: [] }));
  renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: player });
  const section = await screen.findByRole('region', { name: 'Дальше играем' });
  expect(within(section).getByText('В основе')).toBeInTheDocument();
  expect(within(section).getByLabelText('Записано 4 из 10')).toHaveTextContent('4/10');
});

describe('лента', () => {
  const post = (id: number, patch: Partial<import('@altynka/core').FeedPostDto> = {}): import('@altynka/core').FeedPostDto => ({
    id, kind: 'summary', text: `Пост ${id}`, highlights: [], createdAt: Date.parse('2026-11-01T10:00:00Z'), eventId: 7, eventDate: '2026-11-01',
    community: { id: 1, title: 'FC Altynka' }, userId: null, teamColor: null, player: null, reactions: { fire: 0, good: 0, bad: 0 }, myReaction: null, ...patch,
  });
  const withFeed = (posts: unknown) => (api.get as Mock).mockImplementation((path: string) => Promise.resolve(
    path === '/api/notifications' ? { tasks: [] } : path === '/api/feed' ? { posts } : { active: [ev], past: [] }));

  test('posts emphasise names, say when they happened and lead to the player or the match', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T09:00:00Z'));
    withFeed([
      post(1, { kind: 'winner', text: 'Красные выиграли матч: 3 победы.', highlights: ['Красные'], teamColor: 'red', createdAt: Date.parse('2026-11-08T05:00:00Z') }),
      post(2, { kind: 'hero', text: 'Айкын — герой матча: 2 гола и 2 передачи.', highlights: ['Айкын'], userId: 12, player: { userId: 12, name: 'Айкын', photoUrl: 'https://t.me/i/userpic/320/a.jpg' }, createdAt: Date.parse('2026-11-07T15:00:00Z') }),
      post(3, { kind: 'teams_ready', text: 'Составы на матч 1 ноября опубликованы.' }),
    ]);
    renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: player });
    // The heading is there while the skeleton holds the place, so wait for the posts themselves.
    const feed = within((await screen.findAllByRole('link', { name: /Пост|Красные выиграли/ }))[0].closest('section')!);
    const winner = feed.getByRole('link', { name: /Красные выиграли матч/ });
    expect(winner).toHaveAttribute('href', '/event/7?tab=games');
    expect(within(winner).getByText('Красные').tagName).toBe('B');
    expect(within(winner).getByText('Сегодня')).toBeInTheDocument();
    expect(within(winner).getByText('Итог матча')).toBeInTheDocument();
    expect(winner.closest('li')).toHaveClass('card');
    expect(winner.querySelector('.feed-icon')).toHaveClass('team-red');
    const hero = feed.getByRole('link', { name: /герой матча/ });
    expect(hero).toHaveAttribute('href', '/players/12');
    // A player post is signed by the player: photo, name, then the kind of news and the day.
    expect(within(hero).getByText('Герой матча · Вчера')).toBeInTheDocument();
    expect(hero.querySelector('.avatar img')).toHaveAttribute('src', 'https://t.me/i/userpic/320/a.jpg');
    expect(hero.querySelector('.feed-meta b')).toHaveTextContent('Айкын');
    expect(winner.querySelector('.avatar')).toBeNull();
    const teams = feed.getByRole('link', { name: /Составы/ });
    expect(teams).toHaveAttribute('href', '/event/7?tab=teams');
    expect(within(teams).getByText('1 ноября')).toBeInTheDocument();
    // One group: no group tag on posts.
    expect(feed.queryByText('FC Altynka')).toBeNull();
    vi.useRealTimers();
  });

  test('five posts first, the rest on request; group tags for a person with several groups', async () => {
    withFeed(Array.from({ length: 8 }, (_, i) => post(i + 1)));
    renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: twoGroups });
    // The heading is there while the skeleton holds the place, so wait for the posts themselves.
    const feed = within((await screen.findAllByRole('link', { name: /Пост|Красные выиграли/ }))[0].closest('section')!);
    expect(feed.getAllByRole('link')).toHaveLength(5);
    expect(feed.getAllByText('FC Altynka')).toHaveLength(5);
    await userEvent.click(feed.getByRole('button', { name: 'Показать ещё' }));
    expect(feed.getAllByRole('link')).toHaveLength(8);
    expect(feed.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
  });

  test('a reaction shows at once, is saved, can be changed and taken back', async () => {
    withFeed([post(1, { text: 'Красные выиграли матч.', reactions: { fire: 2, good: 0, bad: 0 } })]);
    (api.send as Mock).mockImplementation((_m: string, _p: string, body: { reaction: string | null }) => Promise.resolve(
      { reactions: { fire: body.reaction === 'fire' ? 3 : 2, good: body.reaction === 'good' ? 1 : 0, bad: 0 }, myReaction: body.reaction }));
    renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: player });
    const reactions = within(await screen.findByRole('group', { name: 'Реакции' }));
    expect(reactions.getAllByRole('button')).toHaveLength(3);
    const fire = reactions.getByRole('button', { name: 'Огонь, 2' });
    expect(fire).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(fire);
    expect(await reactions.findByRole('button', { name: 'Огонь, 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(api.send).toHaveBeenLastCalledWith('PUT', '/api/feed/1/reaction', { reaction: 'fire' });
    await userEvent.click(reactions.getByRole('button', { name: 'Нравится' }));
    expect(await reactions.findByRole('button', { name: 'Нравится, 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(reactions.getByRole('button', { name: 'Огонь, 2' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(reactions.getByRole('button', { name: 'Нравится, 1' }));
    expect(api.send).toHaveBeenLastCalledWith('PUT', '/api/feed/1/reaction', { reaction: null });
    expect(await reactions.findByRole('button', { name: 'Нравится' })).toHaveAttribute('aria-pressed', 'false');
    // Reacting never follows the post's link.
    expect(reactions.getByRole('button', { name: 'Не нравится' }).closest('a')).toBeNull();
  });

  test('a post without reactions offers one button that unfolds into the three', async () => {
    withFeed([post(1, { text: 'Красные выиграли матч.' })]);
    (api.send as Mock).mockResolvedValue({ reactions: { fire: 0, good: 1, bad: 0 }, myReaction: 'good' });
    renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: player });
    const row = await screen.findByRole('group', { name: 'Реакции' });
    expect(within(row).getAllByRole('button')).toHaveLength(1);
    await userEvent.click(within(row).getByRole('button', { name: 'Реакция' }));
    expect(within(row).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Огонь', 'Нравится', 'Не нравится']);
    expect(row).toHaveClass('unfolding');
    await userEvent.click(within(row).getByRole('button', { name: 'Нравится' }));
    expect(await within(row).findByRole('button', { name: 'Нравится, 1' })).toHaveAttribute('aria-pressed', 'true');
    // Players have no post menu.
    expect(screen.queryByRole('button', { name: 'Действия с постом' })).toBeNull();
  });

  test('a group admin removes a post from the ⋯ menu after confirming', async () => {
    withFeed([post(1, { text: 'Красные выиграли матч.' }), post(2, { text: 'Матч в цифрах: 2 игры.' })]);
    (api.send as Mock).mockResolvedValue({ ok: true });
    const admin = { ...player, communities: player.communities.map(c => ({ ...c, role: 'admin' as const })) };
    renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: admin });
    const menus = await screen.findAllByRole('button', { name: 'Действия с постом' });
    expect(menus).toHaveLength(2);
    expect(menus[0].closest('a')).toBeNull();
    await userEvent.click(menus[0]);
    const sheet = within(await screen.findByRole('dialog'));
    await userEvent.click(sheet.getByRole('button', { name: 'Удалить пост' }));
    expect(api.send).not.toHaveBeenCalled();
    await userEvent.click(sheet.getByRole('button', { name: /Точно удалить/ }));
    expect(api.send).toHaveBeenCalledWith('DELETE', '/api/feed/1');
    await waitFor(() => expect(screen.queryByRole('link', { name: /Красные выиграли матч/ })).toBeNull());
    expect(screen.getByRole('link', { name: /Матч в цифрах/ })).toBeInTheDocument();
  });

  test.each([[[]], [undefined]])('no section without posts (%o)', async posts => {
    withFeed(posts);
    renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: player });
    await screen.findByRole('heading', { name: 'суббота, 7 ноября' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Лента' })).toBeNull());
  });
});
