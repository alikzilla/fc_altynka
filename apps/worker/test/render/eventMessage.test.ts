import { renderEventMessage, type EventView, type PersonView } from '../../src/render/eventMessage';

const env = { BOT_USERNAME: 'fc_altynka_bot', MINIAPP_SHORT_NAME: 'app' };
const person = (i: number, name = `Игрок${i}`): PersonView => ({ signupId: i, name, tgId: 100 + i, guestOf: null });
export const base: EventView = {
  id: 5, date: '2026-11-07', status: 'collecting', startTime: null, durationHours: null, place: null, comment: null,
  limit: 10, main: [person(1), person(2)], reserve: [person(3)],
};
const targets = (r: ReturnType<typeof renderEventMessage>) =>
  r.keyboard!.inline_keyboard.flat().map(b => ('callback_data' in b ? b.callback_data : 'url' in b ? b.url : ''));

test('collecting message: date, pending time, numbered lists, buttons', () => {
  const r = renderEventMessage(base, env);
  expect(r.html).toContain('суббота, 7 ноября');
  expect(r.html).toContain('Время и поле пока не назначены');
  expect(r.html).toMatch(/1\. Игрок1[\s\S]*2\. Игрок2/);
  expect(r.html).toContain('Записались · 2 из 10');
  expect(r.html).toContain('Резерв · 1');
  expect(r.html).not.toMatch(/⚽|🕘|💬/);
  expect(r.keyboard!.inline_keyboard.flat().map(b => b.text)).toEqual(['Иду', 'Не иду', 'Добавить друга', 'Открыть матч']);
  expect(targets(r)).toEqual([
    'j:5', 'l:5', 'https://t.me/fc_altynka_bot/app?startapp=g5', 'https://t.me/fc_altynka_bot/app?startapp=e5',
  ]);
});

test('scheduled shows time range and place, wraps past midnight', () => {
  const s = { ...base, status: 'scheduled' as const, startTime: '21:00', durationHours: 2 as const, place: 'Шанырак' };
  expect(renderEventMessage(s, env).html).toMatch(/21:00–23:00 · Шанырак/);
  expect(renderEventMessage({ ...s, startTime: '23:30' }, env).html).toContain('23:30–01:30');
});

test('cancelled has no join buttons', () => {
  const r = renderEventMessage({ ...base, status: 'cancelled' }, env);
  expect(r.html).toContain('Матч отменён');
  expect(targets(r)).toEqual(['https://t.me/fc_altynka_bot/app?startapp=e5']);
});

test('guest is labelled with inviter', () => {
  const g: PersonView = { signupId: 9, name: 'Ержан', tgId: null, guestOf: { name: 'Тимур', tgId: 101 } };
  expect(renderEventMessage({ ...base, main: [g] }, env).html).toContain('Ержан · приглашён: Тимур');
});

test('empty signup presents available places without placeholder list', () => {
  const r = renderEventMessage({ ...base, main: [], reserve: [] }, env);
  expect(r.html).toContain('Запись открыта · 10 мест');
  expect(r.html).not.toMatch(/\n—|\n1\./);
});

test.each([
  ['billing', 'Запись закрыта · доступна оплата'],
  ['closed', 'Счёт закрыт'],
] as const)('%s states truthfully describe registration and remove signup buttons', (status, text) => {
  const r = renderEventMessage({ ...base, status }, env);
  expect(r.html).toContain(text);
  expect(r.html).not.toContain('Игра прошла');
  expect(targets(r)).toEqual(['https://t.me/fc_altynka_bot/app?startapp=e5']);
});

test('names with HTML and emoji are escaped', () => {
  const r = renderEventMessage({ ...base, main: [person(1, '<Даня> & ⚽')], comment: '<b>взять форму</b>' }, env);
  expect(r.html).toContain('&lt;Даня&gt; &amp; ⚽');
  expect(r.html).not.toContain('<Даня>');
  expect(r.html).toContain('&lt;b&gt;взять форму');
});
