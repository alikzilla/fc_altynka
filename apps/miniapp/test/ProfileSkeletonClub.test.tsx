import { act, cleanup } from '@testing-library/react';
import { PlayerProfileSkeleton } from '../src/components/skeletons';
import { applyClub } from '../src/lib/theme';
import { player, renderWithApp } from './render';

afterEach(() => { cleanup(); act(() => applyClub(null)); });

test('own-profile skeleton wears the cached club, the peer skeleton does not', () => {
  act(() => applyClub('barcelona'));
  const own = renderWithApp(<PlayerProfileSkeleton own />, { me: player });
  expect(own.container.querySelector('.player-sports-card')).toHaveClass('club-material');
  own.unmount();
  const peer = renderWithApp(<PlayerProfileSkeleton />, { me: player });
  expect(peer.container.querySelector('.player-sports-card')).toHaveClass('material-plum');
});
test('skeleton without a club stays plum', () => {
  const { container } = renderWithApp(<PlayerProfileSkeleton own />, { me: player });
  expect(container.querySelector('.player-sports-card')).toHaveClass('material-plum');
});
