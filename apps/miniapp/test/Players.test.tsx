import type { MemberDto } from '@altynka/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api, ApiError } from '../src/lib/api';
import { Players } from '../src/screens/Players';
import { admin, organizer, renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');

const members: MemberDto[] = [
  { userId: 12, displayName: 'Арман', role: 'player', level: 5 },
  { userId: 1, displayName: 'Орг', role: 'organizer', level: 7 },
];

beforeEach(() => {
  (api.get as Mock).mockResolvedValue(members);
  (api.send as Mock).mockResolvedValue(members[0]);
});

test('admin sets level 8 and role', async () => {
  renderWithApp(<Players />, { me: admin });
  await userEvent.click(await screen.findByRole('button', { name: /Арман/ }));
  await userEvent.click(screen.getByRole('button', { name: '8' }));
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/members/12', { level: 8 });
  await userEvent.click(screen.getByRole('button', { name: 'Сделать организатором' }));
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/members/12', { role: 'organizer' });
});

test('organizer sees levels but no edit sheet', async () => {
  renderWithApp(<Players />, { me: organizer });
  expect(await screen.findByText('Арман')).toBeInTheDocument();
  expect(screen.getByText('уровень 5')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Арман/ })).toBeNull();
  expect(screen.queryByRole('button', { name: '8' })).toBeNull();
});

test('admin renaming to a taken name sees why it failed', async () => {
  (api.send as Mock).mockRejectedValue(new ApiError(409, 'name_taken'));
  renderWithApp(<Players />, { me: admin });
  await userEvent.click(await screen.findByRole('button', { name: /Арман/ }));
  const input = screen.getByLabelText('Имя в списках');
  await userEvent.clear(input);
  await userEvent.type(input, 'Орг');
  await userEvent.click(screen.getByRole('button', { name: 'Имя' }));
  expect(await screen.findByText('Это имя уже занято')).toBeInTheDocument();
});
