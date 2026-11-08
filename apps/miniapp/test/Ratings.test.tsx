import { SKILLS, aggregatePlayerStatistics, type MatchReviewDto, type PlayerProfileDto } from '@altynka/core';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { Link, Route, Switch } from 'wouter';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { SkillAssessment } from '../src/screens/SkillAssessment';
import { MatchReview } from '../src/screens/MatchReview';
import { PlayerProfileSheet } from '../src/screens/PlayerProfile';
import { MatchRatings } from '../src/screens/MatchRatings';
import { Nav } from '../src/components/Nav';
import { Profile } from '../src/screens/Profile';
import { RatingSlider } from '../src/components/RatingSlider';
import { NotificationsProvider } from '../src/state/notifications';
import { organizer, player, renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');

test('skills have no preselected answers, show a summary and send all eight values once', async () => {
  const answers = Object.fromEntries(SKILLS.map(s => [s.key, 7]));
  (api.send as Mock).mockResolvedValue({ value: 7, initial: 7, selfAssessment: answers, matchesCount: 0 });
  renderWithApp(<SkillAssessment />, { me: player });
  expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();
  for (let i = 0; i < 8; i++) {
    expect(screen.getByRole('heading', { name: SKILLS[i].label })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '7' } });
    await userEvent.click(screen.getByRole('button', { name: i === 7 ? 'Посмотреть результат' : 'Далее' }));
  }
  expect(screen.getByText('7,0')).toBeInTheDocument();
  expect(api.send).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить характеристики' }));
  expect(api.send).toHaveBeenCalledExactlyOnceWith('PUT', '/api/me/skills', answers);
});

test('public profile sheet places the rating with identity and keeps match history', async () => {
  const profile: PlayerProfileDto = { telegramUsername:null,role:'player',statistics:aggregatePlayerStatistics([]),gameHistory:[],userId: 12, displayName: 'Арман', playingPosition: 'defender', dominantFoot: 'left', rating: { value: 6.7, initial: 6, selfAssessment: Object.fromEntries(SKILLS.map(s => [s.key, 6])) as never, matchesCount: 3 }, history: [{ eventId: 1, community: { id: 1, title: 'FC Altynka' }, date: '2026-11-04', place: null, score: null }] };
  (api.get as Mock).mockResolvedValue(profile);
  renderWithApp(<PlayerProfileSheet userId={12} onClose={vi.fn()} />, { me: player });
  const dialog = screen.getByRole('dialog');
  expect(await within(dialog).findByText('6,7')).toBeInTheDocument();
  expect(within(dialog).queryByText('Самооценка')).toBeNull();
  expect(within(dialog).getByText('6,7').closest('.player-sports-card')).not.toBeNull();
  expect(within(dialog).getByText('Недостаточно оценок')).toBeInTheDocument();
  expect(within(dialog).queryByText(/Kaspi/)).toBeNull();
});

const openReview: MatchReviewDto = { state: 'open', canFinish: false, completedAt: 1, closesAt: Date.now() + 3600000, serverNow: Date.now(), gameScore: null, participants: [{ userId: player.userId, name: 'Игрок', score: null }, { userId: 12, name: 'Арман', score: null }], ownSubmission: null };

test('review opens a sequential sheet, allows skipping a player and submits the game score explicitly', async () => {
  (api.get as Mock).mockResolvedValue(openReview);
  (api.send as Mock).mockResolvedValue({ ...openReview, state: 'submitted' });
  renderWithApp(<MatchReview eventId={8} />, { me: player });
  await userEvent.click(await screen.findByRole('button', { name: 'Оценить' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('heading', { name: 'Арман' })).toBeInTheDocument();
  expect(within(dialog).queryByRole('heading', { name: 'Игрок' })).toBeNull();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Пропустить игрока' }));
  expect(await within(dialog).findByRole('heading', { name: 'Игра в целом' })).toBeInTheDocument();
  fireEvent.change(within(dialog).getByRole('slider'), { target: { value: '8' } });
  expect(api.send).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Отправить оценки' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events/8/review', { scores: [], gameScore: 8, skipped: false });
  expect(await screen.findByText('Оценки отправлены')).toBeInTheDocument();
});

test('rating a player stays on the same player until Next is pressed', async () => {
  (api.get as Mock).mockResolvedValue(openReview);
  renderWithApp(<MatchReview eventId={8} />, { me: player });
  await userEvent.click(await screen.findByRole('button', { name: 'Оценить' }));
  const dialog = screen.getByRole('dialog');
  const slider = within(dialog).getByRole('slider', { name: 'Оценка: Арман' });
  fireEvent.change(slider, { target: { value: '8' } });
  fireEvent.pointerDown(slider, { pointerId: 1, isPrimary: true, button: 0 });
  fireEvent.pointerUp(slider, { pointerId: 1 });
  expect(slider).toBeEnabled();
  expect(within(dialog).getByRole('heading', { name: 'Арман' })).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Далее' }));
  expect(await within(dialog).findByRole('heading', { name: 'Игра в целом' })).toBeInTheDocument();
  expect(api.send).not.toHaveBeenCalled();
});

test('closed review shows insufficient aggregates and no form', async () => {
  (api.get as Mock).mockResolvedValue({ ...openReview, state: 'closed', closesAt: 2 });
  renderWithApp(<MatchReview eventId={8} />, { me: player });
  expect(await screen.findByText('Оценки за матч')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Отправить оценки' })).toBeNull();
  expect(screen.getAllByText('Недостаточно оценок').length).toBeGreaterThan(0);
});

test('finish confirms the actual roster with main preselected and reserve optional', async () => {
  (api.send as Mock).mockResolvedValue({});
  const ev = { id: 8, main: [{ id: 1, userId: 1, name: 'Орг' }], reserve: [{ id: 2, userId: 2, name: 'Игрок' }], review: { ...openReview, state: 'pending', canFinish: true, completedAt: null, closesAt: null } };
  renderWithApp(<MatchRatings ev={ev as never} reload={vi.fn()} />, { me: organizer });
  await userEvent.click(screen.getByRole('button', { name: 'Завершить игру' }));
  expect(screen.getByRole('checkbox', { name: 'Орг' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /Игрок/ })).not.toBeChecked();
  await userEvent.click(screen.getByRole('checkbox', { name: /Игрок/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Подтвердить участников' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events/8/finish', { participantSignupIds: [1, 2] });
});

test('a linked player profile keeps the profile tab active', async () => {
  (api.get as Mock).mockResolvedValue({ tasks: [] });
  renderWithApp(<NotificationsProvider><Nav /></NotificationsProvider>, { me: player, path: '/players/12' });
  expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute('aria-current', 'page');
});

test('failed survey submission keeps all answers and allows retry', async () => {
  (api.send as Mock).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ value: 7, initial: 7, selfAssessment: {}, matchesCount: 0 });
  renderWithApp(<SkillAssessment />, { me: player });
  for (let i = 0; i < 8; i++) {
    fireEvent.change(screen.getByRole('slider'), { target: { value: '7' } });
    await userEvent.click(screen.getByRole('button', { name: i === 7 ? 'Посмотреть результат' : 'Далее' }));
  }
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить характеристики' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ответы на месте');
  expect(screen.getByText('7,0')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить характеристики' }));
  expect(api.send).toHaveBeenCalledTimes(2);
});

test('a late survey save cannot navigate after leaving the questionnaire', async () => {
  let resolve!: (value: unknown) => void;
  (api.send as Mock).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const { history } = renderWithApp(<><Link href="/matches">Матчи</Link><Switch><Route path="/profile/skills"><SkillAssessment /></Route><Route><p>Другой экран</p></Route></Switch></>, { me: player, path: '/profile/skills' });
  for (let i = 0; i < 8; i++) {
    fireEvent.change(screen.getByRole('slider'), { target: { value: '7' } });
    await userEvent.click(screen.getByRole('button', { name: i === 7 ? 'Посмотреть результат' : 'Далее' }));
  }
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить характеристики' }));
  await userEvent.click(screen.getByRole('link', { name: 'Матчи' }));
  await act(async () => { resolve({ value: 7, initial: 7, selfAssessment: {}, matchesCount: 0 }); });
  expect(history.at(-1)).toBe('/matches');
});

test('own profile integrates the rating into the identity card without a self-assessment card', async () => {
  (api.get as Mock).mockResolvedValue({ history: [{ eventId: 1, community: { id: 1, title: 'FC Altynka' }, date: '2026-11-04', place: null, score: 7 }] });
  renderWithApp(<Profile />, { me: { ...player, profileCompleted: true, rating: { value: 6.7, initial: 6, selfAssessment: Object.fromEntries(SKILLS.map(s => [s.key, 6])) as never, matchesCount: 3 } } });
  expect(within(screen.getByRole('region', { name: 'Профиль игрока' })).getByText('6,7')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Общий рейтинг' })).toBeNull();
  expect(screen.queryByText('Самооценка')).toBeNull();
  expect(await screen.findByRole('heading', { name: 'Последние матчи' })).toBeInTheDocument();
});

test('slider commits only a primary pointer release, not cancellation or keyboard adjustment', () => {
  const change = vi.fn(); const commit = vi.fn();
  renderWithApp(<RatingSlider label="Техника" value={undefined} onChange={change} onCommit={commit} />, { me: player });
  const slider = screen.getByRole('slider', { name: 'Техника' });
  expect(slider).toHaveAttribute('aria-valuetext', 'Оценка не выбрана');
  fireEvent.change(slider, { target: { value: '7' } });
  expect(change).toHaveBeenCalledWith(7);
  expect(commit).not.toHaveBeenCalled();
  fireEvent.pointerDown(slider, { pointerId: 1, isPrimary: true, button: 0 });
  fireEvent.pointerCancel(slider, { pointerId: 1 });
  fireEvent.pointerUp(slider, { pointerId: 1 });
  expect(commit).not.toHaveBeenCalled();
  fireEvent.pointerDown(slider, { pointerId: 2, isPrimary: true, button: 0 });
  fireEvent.pointerUp(slider, { pointerId: 2 });
  expect(commit).toHaveBeenCalledOnce();
});
