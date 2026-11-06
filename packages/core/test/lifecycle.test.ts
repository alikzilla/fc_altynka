import { matchPhase, matchStartsAt, registrationOpen } from '../src/lifecycle';

const scheduled = { status: 'scheduled' as const, date: '2026-11-08', startTime: '20:00' };
const start = Date.parse('2026-11-08T15:00:00Z');
test('kickoff uses Asia/Almaty and handles the UTC date boundary', () => {
  expect(matchStartsAt(scheduled)).toBe(start);
  expect(matchStartsAt({ date: '2026-11-08', startTime: '00:30' })).toBe(Date.parse('2026-11-07T19:30:00Z'));
  expect(matchStartsAt({ date: '2026-11-08', startTime: null })).toBeNull();
  expect(matchStartsAt({ date: '2026-02-30', startTime: '20:00' })).toBeNull();
});
test('signup closes exactly at kickoff and phase becomes playing', () => {
  expect(registrationOpen(scheduled, start - 1)).toBe(true);
  expect(registrationOpen(scheduled, start)).toBe(false);
  expect(matchPhase(scheduled, start - 1)).toBe('scheduled');
  expect(matchPhase(scheduled, start)).toBe('playing');
});
test('collecting allows signup without a scheduled time; terminal phases stay terminal', () => {
  expect(registrationOpen({ ...scheduled, status: 'collecting', startTime: null }, start)).toBe(true);
  for (const status of ['billing', 'closed', 'cancelled'] as const) {
    expect(matchPhase({ ...scheduled, status }, start)).toBe(status);
    expect(registrationOpen({ ...scheduled, status }, start - 1)).toBe(false);
  }
});

test('manual sessions keep registration open past scheduled time until explicit start', () => {
  const manual = { ...scheduled, protocolVersion: 1 as const, startedAt: null, completedAt: null };
  expect(matchPhase(manual, start + 60_000)).toBe('scheduled');
  expect(registrationOpen(manual, start + 60_000)).toBe(true);
  for (const status of ['scheduled', 'billing', 'closed'] as const) {
    const playing = { ...manual, status, startedAt: start };
    expect(matchPhase(playing, start + 1)).toBe('playing');
    expect(registrationOpen(playing, start + 1)).toBe(false);
    expect(matchPhase({ ...playing, completedAt: start + 1 }, start + 2)).toBe(status === 'billing' ? 'billing' : 'closed');
  }
  expect(matchPhase({ ...manual, status: 'cancelled', startedAt: start }, start + 1)).toBe('cancelled');
});
