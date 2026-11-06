import type { EventSummaryDto } from '@altynka/core';
import { screen } from '@testing-library/react';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { Matches } from '../src/screens/Matches';
import { player, renderWithApp, twoGroups } from './render';

vi.mock('../src/lib/api');
vi.mock('../src/lib/tg');
const ev: EventSummaryDto = { id: 5, community: { id: 1, title: 'FC Altynka' }, date: '2026-11-07', status: 'collecting', startTime: null, durationHours: null, place: null, limit: 10, mainCount: 9, reserveCount: 2, my: null };
beforeEach(() => { (api.get as Mock).mockResolvedValue({ active: [ev, { ...ev, id: 6, community: { id: 2, title: 'Футбол по средам' } }], past: [] }); });

test('two groups tag each match row; one group does not', async () => {
  const { unmount } = renderWithApp(<Matches />, { me: twoGroups, path: '/matches?view=active' });
  expect(await screen.findByText('Футбол по средам')).toBeInTheDocument();
  expect(screen.getByText('FC Altynka')).toBeInTheDocument();
  unmount();
  renderWithApp(<Matches />, { me: player, path: '/matches?view=active' });
  await screen.findAllByRole('link');
  expect(screen.queryByText('FC Altynka')).toBeNull();
});
