import { renderTeamsMessage } from '../../src/render/teamsMessage';

test('teams message has colours and names, never levels', () => {
  const r = renderTeamsMessage({
    date: '2026-11-07',
    teams: [
      { emoji: '🔴', name: 'Красные', players: ['Азамат', '&lt;Даня&gt;'] },
      { emoji: '🔵', name: 'Синие', players: ['Арман'] },
    ],
  });
  expect(r.html).toContain('🔴 Красные');
  expect(r.html).toContain('&lt;Даня&gt;');
  expect(r.html).toContain('суббота, 7 ноября');
  expect(r.html).not.toMatch(/уров|level|сила/i);
  expect(r.keyboard).toBeUndefined();
});
