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

test('teams message includes match details, escapes team names and opens its own teams', () => {
  const r = renderTeamsMessage({
    date: '2026-11-07', startTime: '21:00', durationHours: 2, place: '<Шанырак>',
    teams: [{ emoji: '🔴', name: '<Красные>', players: ['Азамат', 'Тимур'] }],
  }, 5, { BOT_USERNAME: 'fc_altynka_bot', MINIAPP_SHORT_NAME: 'app' });
  expect(r.html).toContain('21:00–23:00 · &lt;Шанырак&gt;');
  expect(r.html).toContain('🔴 &lt;Красные&gt;');
  expect(r.html).toContain('Азамат · Тимур');
  expect(r.html).not.toContain('👕');
  expect(r.keyboard!.inline_keyboard.flat()).toEqual([
    { text: 'Открыть составы', url: 'https://t.me/fc_altynka_bot/app?startapp=t5' },
  ]);
});

test('long names or large teams remain readable on separate lines', () => {
  const r = renderTeamsMessage({ date: '2026-11-07', teams: [{ emoji: '🔵', name: 'Синие', players: ['Очень длинное имя участника', 'Тимур'] }] });
  expect(r.html).toContain('Очень длинное имя участника\nТимур');
});
