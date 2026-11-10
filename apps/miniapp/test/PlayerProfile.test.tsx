import { aggregatePlayerStatistics, type PlayerProfileDto } from '@altynka/core';
import { screen, waitFor, within } from '@testing-library/react';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { PlayerProfileSheet } from '../src/screens/PlayerProfile';
import { player, renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');

const base: PlayerProfileDto = { userId: 77, displayName: 'Арман', telegramUsername: null, pinnedAchievement: null, role: 'player', playingPosition: null, dominantFoot: null,
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
