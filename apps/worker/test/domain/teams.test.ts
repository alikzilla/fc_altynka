import { eq } from 'drizzle-orm';
import { events, signups } from '../../src/db/schema';
import { addGuest, cancelEvent, createEvent, joinEvent, leaveEvent, loadQueue, type Deps } from '../../src/domain/events';
import { publishTeams, saveTeams, teamsDto, updateTeamColors } from '../../src/domain/teams';
import { renderTeamsPart } from '../../src/sync/teamsPart';
import { FakeSync } from '../fakes/fakeSync';
import { db, seedCommunity, seedUser } from '../helpers';

let d: Deps & { sync: FakeSync };
let ev: number;
let ids: number[];
let userIds: number[];

beforeEach(async () => {
  d = { db: db(), now: 5_000, sync: new FakeSync() };
  const c = await seedCommunity();
  const org = await seedUser('Орг', { communityId: c.id, role: 'organizer' });
  ev = await createEvent(d, { communityId: c.id, date: '2026-11-07', comment: null, createdBy: org.id });
  const us = await Promise.all(Array.from({ length: 10 }, (_, i) => seedUser(`И${i + 1}`, { communityId: c.id })));
  for (const u of us) await joinEvent(d, ev, u.id);
  userIds = us.map(u => u.id);
  ids = (await loadQueue(d.db, ev)).main.map(s => s.id);
});

const split = (xs: number[]) => [xs.slice(0, 5), xs.slice(5)];

test('saveTeams rejects missing or duplicated players', async () => {
  expect(await saveTeams(d, ev, { teamCount: 2, teams: [ids.slice(0, 5), ids.slice(5, 9)], guestLevels: {} })).toBe('invalid');
  expect(await saveTeams(d, ev, { teamCount: 2, teams: [ids.slice(0, 5), [...ids.slice(5, 9), ids[0]]], guestLevels: {} })).toBe('invalid');
  expect(await saveTeams(d, ev, { teamCount: 3, teams: split(ids), guestLevels: {} })).toBe('invalid');
  expect(await saveTeams(d, ev, { teamCount: 2, teams: split(ids), guestLevels: {} })).toBe('ok');
  expect(await teamsDto(d.db, ev, ids)).toEqual({ colors: ['red', 'blue'], colorsRevision: 0, teamCount: 2, teams: split(ids), publishedAt: null, stale: false, ratingSnapshot: Object.fromEntries(ids.map(id => [id, 5])) });
});

test('guest level is stored for this event only; levels outside 1..10 are invalid', async () => {
  await leaveEvent(d, ev, userIds[9]); // освобождаем место, чтобы гость попал в основу
  const g = (await addGuest(d, ev, userIds[0], 'Ержан')) as { signupId: number; kind: string };
  expect(g.kind).toBe('main');
  const all = (await loadQueue(d.db, ev)).main.map(x => x.id);
  const teams = [all.slice(0, 5), all.slice(5)];
  expect(await saveTeams(d, ev, { teamCount: 2, teams, guestLevels: { [g.signupId]: 11 } })).toBe('invalid');
  expect(await saveTeams(d, ev, { teamCount: 2, teams, guestLevels: { [ids[0]]: 7 } })).toBe('invalid');
  expect(await saveTeams(d, ev, { teamCount: 2, teams, guestLevels: { [g.signupId]: 8 } })).toBe('ok');
  expect((await d.db.select().from(signups).where(eq(signups.id, g.signupId)))[0].guestLevel).toBe(8);
});

test('teams become stale when someone leaves', async () => {
  await saveTeams(d, ev, { teamCount: 2, teams: split(ids), guestLevels: {} });
  await leaveEvent(d, ev, userIds[0]);
  const main = (await loadQueue(d.db, ev)).main.map(s => s.id);
  expect((await teamsDto(d.db, ev, main))!.stale).toBe(true);
});

test('publish requests teams part sync', async () => {
  expect(await publishTeams(d, ev)).toBe('no_teams');
  await saveTeams(d, ev, { teamCount: 2, teams: split(ids), guestLevels: {} });
  expect(await publishTeams(d, ev)).toBe('ok');
  expect(d.sync.calls.at(-1)).toEqual({ eventId: ev, req: { parts: ['teams'] } });
  expect((await teamsDto(d.db, ev, ids))!.publishedAt).toBe(5_000);
});

test('cannot publish stale teams or teams of a cancelled match', async () => {
  await saveTeams(d, ev, { teamCount: 2, teams: split(ids), guestLevels: {} });
  await leaveEvent(d, ev, userIds[0]);
  expect(await publishTeams(d, ev)).toBe('stale');
  await cancelEvent(d, ev);
  expect(await publishTeams(d, ev)).toBe('closed');
});

test('recoloring after kickoff preserves frozen roster, ratings and game revision and updates Telegram', async () => {
  await saveTeams(d, ev, { teamCount: 2, teams: split(ids), guestLevels: {} });
  await publishTeams(d, ev);
  const state = JSON.stringify({ teamCount: 2, roster: [], games: [], receipts: [], initialPair: [0, 1], currentPair: [0, 1], finishParticipants: null });
  await d.db.update(events).set({ startedAt: 5001, gameRevision: 4, gameStateJson: state }).where(eq(events.id, ev));
  expect(await updateTeamColors(d, ev, { colors: ['blue', 'red'], expectedRevision: 0 })).toBe('ok');
  expect(await teamsDto(d.db, ev, ids)).toMatchObject({ colors: ['blue', 'red'], colorsRevision: 1, teams: split(ids), publishedAt: 5000 });
  const [stored] = await d.db.select().from(events).where(eq(events.id, ev));
  expect(stored.gameStateJson).toBe(state);
  expect(stored.gameRevision).toBe(4);
  expect(stored.ratingSnapshot).toBe(JSON.stringify(Object.fromEntries(ids.map(id => [id, 5]))));
  expect(d.sync.calls.at(-1)).toEqual({ eventId: ev, req: { parts: ['teams'] } });
  const message = await renderTeamsPart(d.db, ev);
  expect(message!.html.indexOf('Синие')).toBeLessThan(message!.html.indexOf('Красные'));
});

test('color updates reject duplicates, stale revisions and completed sessions', async () => {
  await saveTeams(d, ev, { teamCount: 2, teams: split(ids), guestLevels: {} });
  expect(await updateTeamColors(d, ev, { colors: ['red', 'red'], expectedRevision: 0 })).toBe('invalid');
  expect(await updateTeamColors(d, ev, { colors: ['green', 'white'], expectedRevision: 0 })).toBe('ok');
  expect(await updateTeamColors(d, ev, { colors: ['white', 'black'], expectedRevision: 0 })).toBe('stale');
  expect((await teamsDto(d.db, ev, ids))!.colors).toEqual(['green', 'white']);
  await d.db.update(events).set({ startedAt: 8000, gameStateJson: '{}', completedAt: 9000 }).where(eq(events.id, ev));
  expect(await updateTeamColors(d, ev, { colors: ['white', 'black'], expectedRevision: 1 })).toBe('closed');
});

test('two concurrent color updates cannot overwrite each other', async () => {
  await saveTeams(d, ev, { teamCount: 2, teams: split(ids), guestLevels: {} });
  const result = await Promise.all([
    updateTeamColors(d, ev, { colors: ['green', 'white'], expectedRevision: 0 }),
    updateTeamColors(d, ev, { colors: ['blue', 'red'], expectedRevision: 0 }),
  ]);
  expect(result.sort()).toEqual(['ok', 'stale']);
  expect((await teamsDto(d.db, ev, ids))!.colorsRevision).toBe(1);
});
