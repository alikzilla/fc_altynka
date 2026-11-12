import { weekStart, weekStartsAt, addDays, availabilityDates, availabilityLabel, normalizeMark, weekdayOf } from '../src/availability';

test('weekday starts on Monday', () => {
  expect(weekdayOf('2026-11-09')).toBe(0);
  expect(weekdayOf('2026-11-11')).toBe(2);
  expect(weekdayOf('2026-11-15')).toBe(6);
});

test('the week starts on its Monday', () => {
  expect(weekStart('2026-11-09')).toBe('2026-11-09');
  expect(weekStart('2026-11-15')).toBe('2026-11-09');
  expect(weekStart('2026-12-02')).toBe('2026-11-30');
  // Понедельник 9 ноября, 00:00 по Алматы — это воскресенье 19:00 UTC.
  expect(weekStartsAt('2026-11-12')).toBe(Date.parse('2026-11-08T19:00:00Z'));
});

test('calendar dates cross month and year borders', () => {
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(availabilityDates('2026-11-28')).toHaveLength(7);
  expect(availabilityDates('2026-11-28').at(-1)).toBe('2026-12-04');
});

test('parts are ordered, deduplicated and dropped for «не могу»', () => {
  expect(normalizeMark({ status: 'yes', parts: ['late', 'morning', 'late'] })).toEqual({ status: 'yes', parts: ['morning', 'late'] });
  expect(normalizeMark({ status: 'no', parts: ['noon'] })).toEqual({ status: 'no', parts: [] });
});

test('labels', () => {
  expect(availabilityLabel(null)).toBe('Не указано');
  expect(availabilityLabel({ status: 'no', parts: [] })).toBe('Не могу');
  expect(availabilityLabel({ status: 'yes', parts: [] })).toBe('Могу · весь день');
  expect(availabilityLabel({ status: 'yes', parts: ['morning', 'noon', 'afternoon', 'evening', 'night', 'late'] })).toBe('Могу · весь день');
  expect(availabilityLabel({ status: 'yes', parts: ['evening', 'night'] })).toBe('Могу · 18:00–20:00, 20:00–22:00');
});
