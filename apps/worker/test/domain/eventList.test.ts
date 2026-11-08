import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { listEvents } from '../../src/domain/eventView';
import { createEvent, joinEvent, type Deps } from '../../src/domain/events';
import { db, seedCommunity, seedUser } from '../helpers';
import { FakeSync } from '../fakes/fakeSync';

test('home feed tells a reservist their queue position', async () => {
  const community = await seedCommunity();
  const people = [];
  for (let i = 0; i < 4; i++) people.push(await seedUser(`Игрок ${i}`, { communityId: community.id, role: i === 0 ? 'organizer' : 'player' }));
  const d: Deps = { db: db(), now: Date.parse('2026-11-08T14:00:00Z'), sync: new FakeSync() };
  const eventId = await createEvent(d, { communityId: community.id, date: '2026-11-10', comment: null, createdBy: people[0].id });
  await d.db.update(schema.events).set({ baseLimit: 1 }).where(eq(schema.events.id, eventId));
  for (const p of people) await joinEvent(d, eventId, p.id);
  const feed = (viewer: number) => listEvents(d.db, [community], viewer, d.now).then(list => list.active[0]);
  expect(await feed(people[0].id)).toMatchObject({ my: 'main', myReservePosition: null });
  expect(await feed(people[1].id)).toMatchObject({ my: 'reserve', myReservePosition: 1 });
  expect(await feed(people[3].id)).toMatchObject({ my: 'reserve', myReservePosition: 3, reserveCount: 3 });
});
