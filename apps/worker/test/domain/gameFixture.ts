import { db, seedCommunity, seedUser } from '../helpers';
import { addGuest, createEvent, joinEvent, loadQueue, scheduleEvent, type Deps } from '../../src/domain/events';
import { saveTeams, publishTeams } from '../../src/domain/teams';
import { FakeSync } from '../fakes/fakeSync';

export async function gameFixture(count: 2 | 3 = 3) {
  const community = await seedCommunity();
  const people = [];
  for (let i = 0; i < 5; i++) people.push(await seedUser(`Игрок ${i}`, { communityId: community.id, role: i === 0 ? 'organizer' : 'player' }));
  const d: Deps = { db: db(), now: Date.parse('2026-11-08T14:00:00Z'), sync: new FakeSync() };
  const eventId = await createEvent(d, { communityId: community.id, date: '2026-11-08', comment: null, createdBy: people[0].id });
  for (const p of people) await joinEvent(d, eventId, p.id);
  await addGuest(d, eventId, people[0].id, 'Гость');
  await scheduleEvent(d, eventId, { startTime: '20:00', durationHours: 2, place: 'Arena' });
  const ids = (await loadQueue(d.db, eventId)).main.map(p => p.id);
  const teams = count === 3 ? [ids.slice(0, 2), ids.slice(2, 4), ids.slice(4)] : [ids.slice(0, 3), ids.slice(3)];
  await saveTeams(d, eventId, { teamCount: count, teams, guestLevels: {} });
  await publishTeams(d, eventId);
  return { d, eventId, people, community, teams, ids, actorId: people[0].id };
}
