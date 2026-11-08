import {
  defaultDisplayName, escapeHtml, formatDateRu, matchCountdown, formatKzPhone, formatTenge, normalizeKzPhone, plural, todayAlmaty,
} from '../src';

test('plural', () => {
  expect([1, 3, 5, 11, 21, 22, 112].map(n => plural(n, 'гол', 'гола', 'голов')))
    .toEqual(['гол', 'гола', 'голов', 'голов', 'гол', 'гола', 'голов']);
});

test('formatTenge uses NBSP', () => {
  expect(formatTenge(2000)).toBe('2 000 ₸');
  expect(formatTenge(150)).toBe('150 ₸');
  expect(formatTenge(1234567)).toBe('1 234 567 ₸');
});

test('todayAlmaty is UTC+5', () => {
  expect(todayAlmaty(new Date('2026-11-03T19:30:00Z'))).toBe('2026-11-04');
  expect(todayAlmaty(new Date('2026-11-03T18:59:00Z'))).toBe('2026-11-03');
});

test('formatDateRu', () => {
  expect(formatDateRu('2026-11-07')).toBe('суббота, 7 ноября');
});

test('normalizeKzPhone accepts common forms, rejects junk', () => {
  for (const s of ['87071234567', '+7 (707) 123-45-67', '7071234567', '8 707 123 45 67'])
    expect(normalizeKzPhone(s)).toBe('+77071234567');
  for (const s of ['12345', 'abc', '+1 202 555 0100', '']) expect(normalizeKzPhone(s)).toBeNull();
});

test('formatKzPhone', () => {
  expect(formatKzPhone('+77071234567')).toBe('+7 707 123 45 67');
});

test('defaultDisplayName', () => {
  expect(defaultDisplayName('Дамир', 'Касымов')).toBe('Дамир К.');
  expect(defaultDisplayName('  Дамир ', '')).toBe('Дамир');
  expect(defaultDisplayName('Дамир', null)).toBe('Дамир');
});

test('escapeHtml', () => {
  expect(escapeHtml('<b>A&B</b>')).toBe('&lt;b&gt;A&amp;B&lt;/b&gt;');
});

test('matchCountdown says how far away the match day is', () => {
  expect(matchCountdown('2026-11-09', '2026-11-09')).toBe('Сегодня');
  expect(matchCountdown('2026-11-10', '2026-11-09')).toBe('Завтра');
  expect(matchCountdown('2026-11-11', '2026-11-09')).toBe('Через 2 дня');
  expect(matchCountdown('2026-11-14', '2026-11-09')).toBe('Через 5 дней');
  expect(matchCountdown('2026-12-01', '2026-11-30')).toBe('Завтра');
  expect(matchCountdown('2027-01-01', '2026-12-11')).toBe('Через 21 день');
  expect(matchCountdown('2026-11-08', '2026-11-09')).toBeNull();
});
