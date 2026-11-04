import type { EventView, PersonView } from '../../src/render/eventMessage';
import { renderNotice } from '../../src/render/notices';

const person = (i: number, name = `Игрок${i}`): PersonView => ({ signupId: i, name, tgId: 100 + i, guestOf: null });
const base: EventView = {
  id: 5, date: '2026-11-07', status: 'scheduled', startTime: '21:00', durationHours: 2, place: 'Шанырак', comment: null,
  limit: 15, main: [], reserve: [],
};
const g: PersonView = { signupId: 9, name: 'Ержан', tgId: null, guestOf: { name: 'Тимур', tgId: 101 } };

test('moves notice mentions by tg id, guest promotion mentions inviter', () => {
  const t = renderNotice({ kind: 'moves', promoted: [person(3), g], demoted: [], scheduled: false }, base);
  expect(t).toContain('<a href="tg://user?id=103">Игрок3</a>');
  expect(t).toContain('Ержан · приглашён: <a href="tg://user?id=101">Тимур</a>');
  expect(t).toContain('В основе');
  expect(t).not.toContain('Игра назначена');
});

test('scheduled notice has date, time, hours, place and moves', () => {
  const t = renderNotice({ kind: 'moves', promoted: [person(3)], demoted: [person(4)], scheduled: true }, base);
  expect(t).toContain('<b>Игра назначена · суббота, 7 ноября</b>\n21:00–23:00 · Шанырак');
  expect(t).toContain('В резерв');
  expect(t).toContain('tg://user?id=104');
});

test('names in mentions are escaped', () => {
  expect(renderNotice({ kind: 'moves', promoted: [person(1, 'A&B')], demoted: [], scheduled: false }, base)).toContain('>A&amp;B</a>');
});

test('cancelled and reminder', () => {
  expect(renderNotice({ kind: 'cancelled' }, base)).toContain('отменён');
  expect(renderNotice({ kind: 'cancelled' }, base)).toContain('Запись закрыта.');
  const t = renderNotice({ kind: 'reminder', debtors: [person(1)], amountByTgId: { 101: 2000 } }, base);
  expect(t).toContain('tg://user?id=101');
  expect(t).toContain('Напоминание об оплате');
  expect(t).not.toContain('2 000 ₸');
});
