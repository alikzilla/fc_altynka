import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aggregatePlayerStatistics, type PlayerStatistics } from '@altynka/core';
import { PlayerAchievements } from '../src/components/PlayerAchievements';
import { player, renderWithApp } from './render';

const stats = (p: Partial<PlayerStatistics> = {}): PlayerStatistics => ({ ...aggregatePlayerStatistics([]), ...p });

test('pinned gold scorer shows tier, progress to platinum and opens its ladder', async () => {
  renderWithApp(<PlayerAchievements statistics={stats({ goals: 64 })} pinned="scorer" onPin={vi.fn()}/>, { me: player });
  expect(screen.getByText('Золото · 64 гола')).toBeInTheDocument();
  expect(screen.getByText('До платины')).toBeInTheDocument();
  expect(screen.getByText('64 / 100')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Бомбардир/ }));
  expect(screen.getByRole('dialog', { name: 'Бомбардир' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Закреплено в профиле ✓' })).toBeDisabled();
});
test('own empty slot invites pinning and opens the list; peer empty slot is inert', async () => {
  const { unmount } = renderWithApp(<PlayerAchievements statistics={stats()} pinned={null} onPin={vi.fn()}/>, { me: player });
  await userEvent.click(screen.getByRole('button', { name: /Закрепи достижение/ }));
  expect(screen.getByRole('dialog', { name: 'Достижения' })).toHaveTextContent('Уровней открыто: 0 из 35');
  unmount();
  renderWithApp(<PlayerAchievements statistics={stats()} pinned={null}/>, { me: player });
  expect(screen.getByText('Ничего не закреплено').closest('button')).toBeNull();
});
test('unknown pinned id renders the empty slot', () => {
  renderWithApp(<PlayerAchievements statistics={stats()} pinned={'sniper' as never}/>, { me: player });
  expect(screen.getByText('Ничего не закреплено')).toBeInTheDocument();
});
test('peer view of a pinned ladder that is closed for the viewer shows it locked', () => {
  renderWithApp(<PlayerAchievements statistics={stats()} pinned="winner"/>, { me: player });
  expect(screen.getByText('Победитель')).toBeInTheDocument();
  expect(screen.getByText('Не открыто')).toBeInTheDocument();
});
test('legend shows the maximum level with a full bar', () => {
  renderWithApp(<PlayerAchievements statistics={stats({ goals: 600 })} pinned="scorer"/>, { me: player });
  expect(screen.getByText('Максимальный уровень')).toBeInTheDocument();
  const bar = screen.getByRole('progressbar');
  expect(bar).toHaveAttribute('value', bar.getAttribute('max'));
});
test('pinning calls onPin with the id', async () => {
  const onPin = vi.fn().mockResolvedValue(undefined);
  renderWithApp(<PlayerAchievements statistics={stats({ wins: 12 })} pinned="scorer" onPin={onPin}/>, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Все достижения' }));
  await userEvent.click(screen.getByRole('button', { name: /Победитель/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Закрепить в профиле' }));
  expect(onPin).toHaveBeenCalledWith('winner');
});
test('peers see the ladder without a pin button', async () => {
  renderWithApp(<PlayerAchievements statistics={stats({ wins: 12 })} pinned={null}/>, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Все достижения' }));
  await userEvent.click(screen.getByRole('button', { name: /Победитель/ }));
  expect(screen.getByRole('dialog', { name: 'Победитель' })).toHaveTextContent('Легенда');
  expect(screen.queryByRole('button', { name: /Закреп/ })).toBeNull();
});
test('closed ladder offers a disabled pin button', async () => {
  renderWithApp(<PlayerAchievements statistics={stats()} pinned={null} onPin={vi.fn()}/>, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Все достижения' }));
  await userEvent.click(screen.getByRole('button', { name: /Хет-трик/ }));
  expect(screen.getByRole('button', { name: 'Откроется на первом уровне' })).toBeDisabled();
});
test('a failed pin shows an error and keeps the button usable', async () => {
  const onPin = vi.fn().mockRejectedValue(new Error('network'));
  renderWithApp(<PlayerAchievements statistics={stats({ wins: 12 })} pinned={null} onPin={onPin}/>, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Все достижения' }));
  await userEvent.click(screen.getByRole('button', { name: /Победитель/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Закрепить в профиле' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не получилось закрепить. Попробуй ещё раз.');
  expect(screen.getByRole('button', { name: 'Закрепить в профиле' })).toBeEnabled();
});
test('a successful pin shows as pinned at once, before the profile reloads', async () => {
  const onPin = vi.fn().mockResolvedValue(undefined);
  renderWithApp(<PlayerAchievements statistics={stats({ wins: 12 })} pinned={null} onPin={onPin}/>, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Все достижения' }));
  await userEvent.click(screen.getByRole('button', { name: /Победитель/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Закрепить в профиле' }));
  expect(await screen.findByRole('button', { name: 'Закреплено в профиле ✓' })).toBeDisabled();
});
