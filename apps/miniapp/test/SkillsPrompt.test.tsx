import { act, screen } from '@testing-library/react';
import { noteJoinedMatch, SkillsPrompt } from '../src/components/SkillsPrompt';
import { player, renderWithApp } from './render';

vi.mock('../src/lib/tg');
const fresh = { ...player, rating: { value: 5, initial: 5, selfAssessment: null, matchesCount: 0 } };
beforeEach(() => sessionStorage.clear());

test('the skills prompt waits for the first signup instead of covering the first look at Home', async () => {
  renderWithApp(<SkillsPrompt />, { me: fresh, path: '/' });
  expect(screen.queryByRole('dialog', { name: 'Как ты играешь?' })).toBeNull();
  act(() => noteJoinedMatch());
  expect(await screen.findByRole('dialog', { name: 'Как ты играешь?' })).toBeInTheDocument();
});

test('the profile still offers the prompt before any signup', async () => {
  renderWithApp(<SkillsPrompt />, { me: fresh, path: '/profile' });
  expect(await screen.findByRole('dialog', { name: 'Как ты играешь?' })).toBeInTheDocument();
});
