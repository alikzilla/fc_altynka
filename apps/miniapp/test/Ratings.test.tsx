import { SKILLS, aggregatePlayerStatistics, type MatchReviewDto, type PlayerProfileDto } from '@altynka/core';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  const profile: PlayerProfileDto = { telegramUsername:null,pinnedAchievement:null,role:'player',statistics:aggregatePlayerStatistics([]),gameHistory:[],userId: 12, displayName: 'Арман', playingPosition: 'defender', dominantFoot: 'left', rating: { value: 6.7, initial: 6, selfAssessment: Object.fromEntries(SKILLS.map(s => [s.key, 6])) as never, matchesCount: 3 }, history: [{ eventId: 1, community: { id: 1, title: 'FC Altynka' }, date: '2026-11-04', place: null, score: null }] };
  (api.get as Mock).mockResolvedValue(profile);
  renderWithApp(<PlayerProfileSheet userId={12} onClose={vi.fn()} />, { me: player });
  const dialog = screen.getByRole('dialog');
  expect(await within(dialog).findByText('6,7')).toBeInTheDocument();
  expect(within(dialog).queryByText('Самооценка')).toBeNull();
  expect(within(dialog).getByText('6,7').closest('.player-sports-card')).not.toBeNull();
  expect(within(dialog).getByText('Недостаточно оценок')).toBeInTheDocument();
  expect(within(dialog).queryByText(/Kaspi/)).toBeNull();
});

const openReview: MatchReviewDto = { state: 'open', canFinish: false, completedAt: 1, closesAt: Date.now() + 3600000, serverNow: Date.now(), gameScore: null, participants: [{ userId: player.userId, name: 'Игрок', score: null }, { userId: 12, name: 'Арман', score: null }], ownSubmission: null, awards: null };

/** Walks past the five award steps without picking anybody. */
async function skipAwards(dialog: HTMLElement, from = 0) {
  for (const title of ['MVP матча', 'Лучший нападающий', 'Лучший полузащитник', 'Лучший защитник', 'Лучший вратарь'].slice(from)) {
    expect(await within(dialog).findByRole('heading', { name: title })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Пропустить награду' }));
  }
}
const trioReview: MatchReviewDto = { ...openReview, participants: [...openReview.participants, { userId: 13, name: 'Ерлан', score: null }] };
async function openRater(review: MatchReviewDto) {
  (api.get as Mock).mockResolvedValue(review);
  (api.send as Mock).mockResolvedValue({ ...review, state: 'submitted' });
  renderWithApp(<MatchReview eventId={8} />, { me: player });
  await userEvent.click(await screen.findByRole('button', { name: 'Оценить' }));
  return screen.getByRole('dialog');
}
async function rate(dialog: HTMLElement, name: string, value: number) {
  fireEvent.change(await within(dialog).findByRole('slider', { name: `Оценка: ${name}` }), { target: { value: String(value) } });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Далее' }));
}

test('five award steps follow the players, show the ratings just given and are sent with them', async () => {
  const dialog = await openRater(trioReview);
  await rate(dialog, 'Арман', 8); await rate(dialog, 'Ерлан', 9);
  expect(await within(dialog).findByRole('heading', { name: 'MVP матча' })).toBeInTheDocument();
  expect(within(dialog).getByText('Кто был лучшим игроком матча?')).toBeInTheDocument();
  expect(within(dialog).getByText('3 из 8')).toBeInTheDocument();
  expect(within(dialog).queryByRole('radio', { name: /Игрок/ })).toBeNull();
  expect(within(dialog).getByRole('radio', { name: /Ерлан/ }).closest('label')).toHaveTextContent('твоя оценка 9');
  expect(within(dialog).getByRole('button', { name: 'Далее' })).toBeDisabled();
  await userEvent.click(within(dialog).getByRole('radio', { name: /Ерлан/ }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Далее' }));
  await skipAwards(dialog, 1);
  expect(await within(dialog).findByRole('heading', { name: 'Матч в целом' })).toBeInTheDocument();
  expect(within(dialog).getByText(/наград: 1 из 5/)).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Отправить оценки' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events/8/review',
    { scores: [{ userId: 12, score: 8 }, { userId: 13, score: 9 }], gameScore: null, skipped: false, awards: { mvp: 13 } });
});

test('skipping an award clears the pick, and a poll without picks says the award step was skipped', async () => {
  const dialog = await openRater(trioReview);
  await rate(dialog, 'Арман', 8); await rate(dialog, 'Ерлан', 9);
  await userEvent.click(await within(dialog).findByRole('radio', { name: /Арман/ }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Пропустить награду' }));
  expect(await within(dialog).findByRole('heading', { name: 'Лучший нападающий' })).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Назад' }));
  expect(await within(dialog).findByRole('radio', { name: /Арман/ })).not.toBeChecked();
  await skipAwards(dialog);
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Отправить оценки' }));
  expect((api.send as Mock).mock.calls[0][2]).toEqual({ scores: [{ userId: 12, score: 8 }, { userId: 13, score: 9 }], gameScore: null, skipped: false, awardsSkipped: true });
});

test('an unrated candidate shows a dash, and awards alone cannot be submitted', async () => {
  const dialog = await openRater(openReview);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Пропустить игрока' }));
  const arman = await within(dialog).findByRole('radio', { name: /Арман/ });
  expect(arman.closest('label')).toHaveTextContent('—');
  await userEvent.click(arman);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Далее' }));
  await skipAwards(dialog, 1);
  expect(await within(dialog).findByRole('button', { name: 'Отправить оценки' })).toBeDisabled();
  expect(within(dialog).getByText('Чтобы отправить, оцени хотя бы одного игрока или матч')).toBeInTheDocument();
});

test('reopening the sheet resumes at the first unanswered step, or at the match rating when all is answered', async () => {
  const dialog = await openRater(openReview);
  await rate(dialog, 'Арман', 8);
  await userEvent.click(await within(dialog).findByRole('radio', { name: /Арман/ }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Далее' }));
  expect(await within(dialog).findByRole('heading', { name: 'Лучший нападающий' })).toBeInTheDocument();
  const reopen = async (from: HTMLElement) => {
    await userEvent.click(within(from).getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить оценку' }));
    return screen.getByRole('dialog');
  };
  let sheet = await reopen(dialog);
  expect(within(sheet).getByRole('heading', { name: 'Лучший нападающий' })).toBeInTheDocument();
  for (const title of ['Лучший нападающий', 'Лучший полузащитник', 'Лучший защитник', 'Лучший вратарь']) {
    expect(await within(sheet).findByRole('heading', { name: title })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('radio', { name: /Арман/ }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Далее' }));
  }
  expect(await within(sheet).findByRole('heading', { name: 'Матч в целом' })).toBeInTheDocument();
  sheet = await reopen(sheet);
  expect(within(sheet).getByRole('heading', { name: 'Матч в целом' })).toBeInTheDocument();
});

test('with nobody else to pick there are no award steps', async () => {
  const dialog = await openRater({ ...openReview, participants: [openReview.participants[0]] });
  expect(within(dialog).getByRole('heading', { name: 'Матч в целом' })).toBeInTheDocument();
  expect(within(dialog).getByText('1 из 1')).toBeInTheDocument();
});

test('closed match: the MVP in a gold hero card, positions as four tiles', async () => {
  const who = (userId: number, name: string) => ({ userId, name, photoUrl: null });
  (api.get as Mock).mockResolvedValue({ ...openReview, state: 'closed', closesAt: 2, awards: {
    mvp: { winners: [who(12, 'Арман')], votes: 6 }, forward: null, midfielder: { winners: [who(12, 'Арман'), who(13, 'Ерлан')], votes: 2 },
    defender: { winners: [who(13, 'Ерлан'), who(14, 'Санжар'), who(15, 'Тимур')], votes: 3 }, goalkeeper: null } });
  const { container } = renderWithApp(<MatchReview eventId={8} />, { me: player });
  const block = (await screen.findByRole('heading', { name: 'Награды матча' })).closest('section')!;
  const hero = block.querySelector('.match-award-hero')!;
  expect(hero.textContent).toContain('MVP матча');
  expect(hero.textContent).toContain('Арман');
  expect(hero.textContent).toContain('6 голосов');
  expect(within(hero as HTMLElement).getByRole('link', { name: 'Арман' })).toHaveAttribute('href', '/players/12');
  const tiles = [...container.querySelectorAll('.match-award-tile')];
  expect(tiles.map(tile => tile.textContent)).toEqual([
    'НападающийНедостаточно голосов', 'ПолузащитникАрман и Ерлан2 голоса', 'ЗащитникЕрлан, Санжар и Тимур3 голоса', 'ВратарьНедостаточно голосов']);
  expect(within(tiles[2] as HTMLElement).getByRole('link', { name: 'Санжар' })).toHaveAttribute('href', '/players/14');
});

test('without an MVP the hero card says so', async () => {
  (api.get as Mock).mockResolvedValue({ ...openReview, state: 'closed', closesAt: 2, awards: {
    mvp: null, forward: { winners: [{ userId: 12, name: 'Арман', photoUrl: null }], votes: 2 }, midfielder: null, defender: null, goalkeeper: null } });
  renderWithApp(<MatchReview eventId={8} />, { me: player });
  const block = (await screen.findByRole('heading', { name: 'Награды матча' })).closest('section')!;
  expect(block.querySelector('.match-award-hero')!.textContent).toBe('MVP матчаНедостаточно голосов');
});

test('a closed match without awards shows no awards block', async () => {
  (api.get as Mock).mockResolvedValue({ ...openReview, state: 'closed', closesAt: 2 });
  renderWithApp(<MatchReview eventId={8} />, { me: player });
  expect(await screen.findByText('Оценки за матч')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Награды матча' })).toBeNull();
});

test('review opens a sequential sheet, allows skipping a player and submits the game score explicitly', async () => {
  (api.get as Mock).mockResolvedValue(openReview);
  (api.send as Mock).mockResolvedValue({ ...openReview, state: 'submitted' });
  renderWithApp(<MatchReview eventId={8} />, { me: player });
  await userEvent.click(await screen.findByRole('button', { name: 'Оценить' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('heading', { name: 'Арман' })).toBeInTheDocument();
  expect(within(dialog).queryByRole('heading', { name: 'Игрок' })).toBeNull();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Пропустить игрока' }));
  await skipAwards(dialog);
  expect(await within(dialog).findByRole('heading', { name: 'Матч в целом' })).toBeInTheDocument();
  fireEvent.change(within(dialog).getByRole('slider'), { target: { value: '8' } });
  expect(api.send).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Отправить оценки' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events/8/review', { scores: [], gameScore: 8, skipped: false, awardsSkipped: true });
  expect(await screen.findByText('Спасибо, оценки отправлены')).toBeInTheDocument();
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
  expect(await within(dialog).findByRole('heading', { name: 'MVP матча' })).toBeInTheDocument();
  expect(api.send).not.toHaveBeenCalled();
});

test('closed review shows insufficient aggregates and no form', async () => {
  (api.get as Mock).mockResolvedValue({ ...openReview, state: 'closed', closesAt: 2 });
  renderWithApp(<MatchReview eventId={8} />, { me: player });
  expect(await screen.findByText('Оценки за матч')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Отправить оценки' })).toBeNull();
  expect(screen.getAllByText('Недостаточно оценок').length).toBeGreaterThan(0);
});

test('organizer sees who answered and closes the review early after confirming', async () => {
  const progress: MatchReviewDto = { ...openReview, state: 'submitted', canClose: true, participants: [{ userId: organizer.userId, name: 'Орг', score: null, voted: true }, { userId: 12, name: 'Арман', score: null, voted: false }] };
  (api.get as Mock).mockResolvedValue(progress);
  (api.send as Mock).mockResolvedValue({ ...progress, state: 'closed', canClose: false, closesAt: 2 });
  renderWithApp(<MatchReview eventId={8} />, { me: organizer });
  expect(await screen.findByText(/Ответили 1 из 2/)).toBeInTheDocument();
  expect(screen.getByText('Ждём').closest('li')).toHaveTextContent('Арман');
  await userEvent.click(screen.getByRole('button', { name: 'Закрыть опрос' }));
  expect(api.send).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Закрыть и показать итоги?' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events/8/review/close');
  expect(await screen.findByText('Оценки за матч')).toBeInTheDocument();
  expect(screen.queryByText('Кто ответил')).toBeNull();
});

test('players do not see the answer list or the close action', async () => {
  (api.get as Mock).mockResolvedValue({ ...openReview, state: 'submitted', canClose: false });
  renderWithApp(<MatchReview eventId={8} />, { me: player });
  expect(await screen.findByText('Спасибо, оценки отправлены')).toBeInTheDocument();
  expect(screen.queryByText('Кто ответил')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Закрыть опрос' })).toBeNull();
});

test('finish confirms the actual roster with main preselected and reserve optional', async () => {
  (api.send as Mock).mockResolvedValue({});
  const ev = { id: 8, main: [{ id: 1, userId: 1, name: 'Орг' }], reserve: [{ id: 2, userId: 2, name: 'Игрок' }], review: { ...openReview, state: 'pending', canFinish: true, completedAt: null, closesAt: null } };
  renderWithApp(<MatchRatings ev={ev as never} reload={vi.fn()} />, { me: organizer });
  await userEvent.click(screen.getByRole('button', { name: 'Завершить матч' }));
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

const stats = (goals: number, assists: number) => ({ games: 6, goals, assists, wins: 4, draws: 1, losses: 1, assistsTracked: true });

test('the rating step and the award list show what the player did in the match', async () => {
  const review: MatchReviewDto = { ...trioReview, participants: trioReview.participants.map(p => ({ ...p, ...(p.userId === 12 ? { stats: stats(3, 2) } : p.userId === 13 ? { stats: stats(0, 0) } : {}) })) };
  const dialog = await openRater(review);
  const tiles = within(dialog).getByRole('list', { name: 'За этот матч' });
  expect(tiles).toHaveTextContent('3 гола');
  expect(tiles).toHaveTextContent('2 паса');
  expect(tiles).toHaveTextContent('6 игр');
  expect(tiles).toHaveTextContent('4 победы, 1 ничья, 1 поражение');
  await rate(dialog, 'Арман', 8); await rate(dialog, 'Ерлан', 9);
  expect((await within(dialog).findByRole('radio', { name: /Арман/ })).closest('label')).toHaveTextContent('3 гола · 2 паса');
  expect(within(dialog).getByRole('radio', { name: /Ерлан/ }).closest('label')).toHaveTextContent('без голов и пасов');
});

test('an answer sent without awards offers the award steps alone and sends them separately', async () => {
  const submitted: MatchReviewDto = { ...trioReview, state: 'submitted', canAddAwards: true,
    participants: trioReview.participants.map(p => p.userId === 12 ? { ...p, stats: stats(2, 1) } : p),
    ownSubmission: { scores: [{ userId: 12, score: 7 }], gameScore: 8, skipped: false } };
  (api.get as Mock).mockResolvedValue(submitted);
  (api.send as Mock).mockResolvedValue({ ...submitted, canAddAwards: false, ownSubmission: { ...submitted.ownSubmission!, awards: { mvp: 12 } } });
  renderWithApp(<MatchReview eventId={8} />, { me: player });
  expect(await screen.findByRole('heading', { name: 'Выбери лучших игроков матча' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Выбрать лучших' }));
  const dialog = screen.getByRole('dialog', { name: 'Лучшие игроки матча' });
  expect(within(dialog).getByRole('heading', { name: 'MVP матча' })).toBeInTheDocument();
  expect(within(dialog).getByText('1 из 6')).toBeInTheDocument();
  expect(within(dialog).getByRole('radio', { name: /Арман/ }).closest('label')).toHaveTextContent('твоя оценка 7');
  await userEvent.click(within(dialog).getByRole('radio', { name: /Арман/ }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Далее' }));
  await skipAwards(dialog, 1);
  expect(await within(dialog).findByRole('heading', { name: 'Твой выбор' })).toBeInTheDocument();
  expect(within(dialog).getByText('MVP матча').closest('li')).toHaveTextContent('Арман');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Отправить награды' }));
  expect(api.send).toHaveBeenCalledExactlyOnceWith('POST', '/api/events/8/review/awards', { awards: { mvp: 12 } });
  expect(await screen.findByText('Спасибо, оценки отправлены')).toBeInTheDocument();
});

test('the late award steps can be sent without picks', async () => {
  const submitted: MatchReviewDto = { ...trioReview, state: 'submitted', canAddAwards: true, ownSubmission: { scores: [{ userId: 12, score: 7 }], gameScore: null, skipped: false } };
  (api.get as Mock).mockResolvedValue(submitted);
  (api.send as Mock).mockResolvedValue({ ...submitted, canAddAwards: false });
  renderWithApp(<MatchReview eventId={8} />, { me: player });
  await userEvent.click(await screen.findByRole('button', { name: 'Выбрать лучших' }));
  const dialog = screen.getByRole('dialog');
  await skipAwards(dialog);
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Отправить без наград' }));
  expect(api.send).toHaveBeenCalledExactlyOnceWith('POST', '/api/events/8/review/awards', { skipped: true });
});
