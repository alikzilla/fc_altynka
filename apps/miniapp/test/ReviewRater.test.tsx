import { AWARDS, AWARD_LABEL, AWARD_QUESTION } from '@altynka/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewRater } from '../src/screens/ReviewRater';

vi.mock('../src/lib/tg');

const players = [{ userId: 1, name: 'Арман' }, { userId: 2, name: 'Данияр' }];
// Данияр is the longer name: the person copy takes it.
const props = { players, scores: {}, gameScore: null, awards: {}, onAward: vi.fn(), onScore: vi.fn(), onGameScore: vi.fn(), onClose: vi.fn(), onSubmit: vi.fn(async () => {}), busy: false, error: null };

test('the longest prize step is drawn invisibly under every step, so the sheet keeps one height', () => {
  render(<ReviewRater {...props} />);
  const stack = document.querySelector('.review-stack')!;
  const ghosts = [...stack.querySelectorAll(':scope > .sheet-stack-hidden')];
  // Two copies: a person with the stat tiles (taller than the list while there are few players) and a prize.
  expect(ghosts).toHaveLength(2);
  expect(ghosts.every(ghost => ghost.getAttribute('aria-hidden') === 'true' && ghost.hasAttribute('inert'))).toBe(true);
  const ghost = ghosts.find(copy => copy.querySelector('input[type="radio"]'))!;
  expect(ghosts.find(copy => copy !== ghost)).toHaveTextContent('Данияр');
  const longest = [...AWARDS].sort((a, b) => (AWARD_LABEL[b].length + AWARD_QUESTION[b].length) - (AWARD_LABEL[a].length + AWARD_QUESTION[a].length))[0];
  expect(ghost).toHaveTextContent(AWARD_QUESTION[longest]);
  // The copy lists the same players but is never a live control: its own radio group, disabled.
  const radios = ghost.querySelectorAll<HTMLInputElement>('input[type="radio"]');
  expect(radios).toHaveLength(players.length);
  expect([...radios].every(radio => radio.name === 'award-ghost' && radio.closest('fieldset')!.disabled)).toBe(true);
  // Unrated rows show «—», the copy the longest text («твоя оценка 10»): rating someone never grows it.
  expect(ghost.querySelectorAll('.award-option-score')).toHaveLength(players.length);
  expect([...ghost.querySelectorAll('.award-option-score')].every(row => row.textContent === 'твоя оценка 10')).toBe(true);
  // The live step is the only one the reader can reach.
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
});

test('the recap line keeps its place on every step and shows on the last one', async () => {
  render(<ReviewRater {...props} scores={{ 1: 7, 2: 8 }} />);
  const dialog = screen.getByRole('dialog');
  const recap = () => dialog.querySelector<HTMLElement>('.review-recap')!;
  expect(recap().classList.contains('sheet-stack-hidden')).toBe(true);
  expect(recap()).toHaveAttribute('aria-hidden', 'true');
  expect(recap()).toHaveTextContent('Оценено игроков: 2 из 2');
  // The poll resumes at the first prize; skip them all to reach the final step.
  const total = players.length + AWARDS.length + 1;
  for (let i = 0; i < AWARDS.length; i++) {
    await userEvent.click(within(dialog).getByRole('button', { name: 'Пропустить награду' }));
    expect(await screen.findByText(`${players.length + i + 2} из ${total}`)).toBeInTheDocument();
  }
  expect(recap().classList.contains('sheet-stack-hidden')).toBe(false);
  expect(recap()).not.toHaveAttribute('aria-hidden');
});

test('the awards-only poll has no recap and no ghost without players', () => {
  render(<ReviewRater {...props} mode="awards" players={[]} />);
  expect(document.querySelector('.review-recap')).toBeNull();
  expect(document.querySelector('.review-stack > .sheet-stack-hidden')).toBeNull();
  expect(document.querySelector('.review-stack')).not.toBeNull();
});
