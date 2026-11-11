import { addDays, availabilityDates, availabilityLabel, emptyWeekly, normalizeMark, resolveAvailability, weekdayOf } from '../src/availability';

test('weekday starts on Monday', () => {
  expect(weekdayOf('2026-11-09')).toBe(0);
  expect(weekdayOf('2026-11-11')).toBe(2);
  expect(weekdayOf('2026-11-15')).toBe(6);
});

test('calendar dates cross month and year borders', () => {
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(availabilityDates('2026-11-25')).toHaveLength(14);
  expect(availabilityDates('2026-11-25').at(-1)).toBe('2026-12-08');
});

test('a mark on the date beats the weekly pattern; nothing set stays unknown', () => {
  const weekly = emptyWeekly();
  weekly[2] = { status: 'yes', parts: ['evening'] };
  expect(resolveAvailability(weekly, {}, '2026-11-11')).toEqual({ status: 'yes', parts: ['evening'] });
  expect(resolveAvailability(weekly, { '2026-11-11': { status: 'no', parts: [] } }, '2026-11-11')).toEqual({ status: 'no', parts: [] });
  expect(resolveAvailability(weekly, {}, '2026-11-12')).toBeNull();
});

test('parts are ordered, deduplicated and dropped for «не могу»', () => {
  expect(normalizeMark({ status: 'yes', parts: ['evening', 'morning', 'evening'] })).toEqual({ status: 'yes', parts: ['morning', 'evening'] });
  expect(normalizeMark({ status: 'no', parts: ['day'] })).toEqual({ status: 'no', parts: [] });
});

test('labels', () => {
  expect(availabilityLabel(null)).toBe('Не указано');
  expect(availabilityLabel({ status: 'no', parts: [] })).toBe('Не могу');
  expect(availabilityLabel({ status: 'yes', parts: [] })).toBe('Могу');
  expect(availabilityLabel({ status: 'yes', parts: ['day', 'evening'] })).toBe('Могу · день, вечер');
});
