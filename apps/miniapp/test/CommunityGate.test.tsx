import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { CommunityGate } from '../src/screens/CommunityGate';

function DraftForm({ team }: { team: string }) {
  const [draft, setDraft] = useState('');
  return <form aria-label={`Черновик ${team}`}><label>Комментарий<input value={draft} onChange={e => setDraft(e.target.value)} /></label></form>;
}

afterEach(() => vi.unstubAllGlobals());

test('switching teams tears down an open form and never carries its draft into the next team', async () => {
  const teams = [{ id: 1, title: 'Команда A' }, { id: 2, title: 'Команда B' }];
  vi.stubGlobal('fetch', vi.fn(async (path: string, init: RequestInit) => {
    if (path === '/api/communities') return Response.json({ communities: teams });
    const id = Number((init.headers as Record<string, string>)['X-Community-Id']);
    return Response.json({ community: teams[id - 1] });
  }));
  const location = memoryLocation({ path: '/matches' });
  render(<Router hook={location.hook}><CommunityGate>{community => <DraftForm team={community.title} />}</CommunityGate></Router>);
  await userEvent.click(await screen.findByRole('button', { name: /Команда A/ }));
  await userEvent.type(screen.getByLabelText('Комментарий'), 'Черновик только для A');
  await userEvent.click(screen.getByRole('button', { name: 'Сменить команду' }));
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', { name: /Команда B/ }));
  expect(screen.getByRole('form', { name: 'Черновик Команда B' })).toBeInTheDocument();
  expect(screen.getByLabelText('Комментарий')).toHaveValue('');
});
