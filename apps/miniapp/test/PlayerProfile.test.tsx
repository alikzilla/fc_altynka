import { aggregatePlayerStatistics, type PlayerProfileDto } from '@altynka/core';
import { act, screen, waitFor, within } from '@testing-library/react';
import type { Mock } from 'vitest';
import { applyClub } from '../src/lib/theme';
import { api } from '../src/lib/api';
import { PlayerProfileSheet } from '../src/screens/PlayerProfile';
import { player, renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');

const base: PlayerProfileDto = { userId: 77, displayName: 'Арман', telegramUsername: null, pinnedAchievement: null, favoriteClub: null, role: 'player', playingPosition: null, dominantFoot: null,
  rating: { value: 5, initial: 5, selfAssessment: null, matchesCount: 0 }, statistics: aggregatePlayerStatistics([]), gameHistory: [], history: [] };

test('another player sees the injury an admin set moments ago, even with the profile cached', async () => {
  (api.get as Mock).mockResolvedValue({ ...base, injured: false });
  const first = renderWithApp(<PlayerProfileSheet userId={77} onClose={vi.fn()} />, { me: player });
  expect(await within(screen.getByRole('dialog')).findByText('Арман')).toBeInTheDocument();
  expect(screen.queryByTestId('injury-badge')).toBeNull();
  first.unmount();

  // The admin marks the injury elsewhere; reopening within the cache window must fetch again.
  (api.get as Mock).mockResolvedValue({ ...base, injured: true });
  renderWithApp(<PlayerProfileSheet userId={77} onClose={vi.fn()} />, { me: player });
  expect(await screen.findByTestId('injury-badge')).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).getByText('Травма')).toBeInTheDocument();
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
});

test("peer profile uses the owner's club, not the viewer's", async () => {
  act(() => applyClub('real-madrid'));
  (api.get as Mock).mockResolvedValue({ ...base, favoriteClub: 'barcelona' });
  renderWithApp(<PlayerProfileSheet userId={77} onClose={vi.fn()} />, { me: player });
  const label = await screen.findByText('Любимый клуб: Барселона');
  expect(label.closest('section')).toHaveClass('club-material');
  act(() => applyClub(null));
});

test('own profile opened as a sheet loads in the cached club colour, a peer profile in plum', async () => {
  act(() => applyClub('kairat'));
  (api.get as Mock).mockReturnValue(new Promise(() => {}));
  const own = renderWithApp(<PlayerProfileSheet userId={player.userId} onClose={vi.fn()} />, { me: player });
  expect(document.querySelector('.player-sports-card')).toHaveClass('club-material');
  own.unmount();
  renderWithApp(<PlayerProfileSheet userId={player.userId + 1} onClose={vi.fn()} />, { me: player });
  expect(document.querySelector('.player-sports-card')).toHaveClass('material-plum');
  act(() => applyClub(null));
});
