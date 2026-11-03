import { setDepsFactoryForTests } from '../../src/api/routes';
import { getDb } from '../../src/db/client';
import { __setTgClientForTests } from '../../src/telegram/client';
import { FakeSync } from '../fakes/fakeSync';
import { FakeTg } from '../fakes/fakeTg';
import { seedCommunity, seedUser } from '../helpers';

export interface ApiWorld {
  tg: FakeTg;
  sync: FakeSync;
  communityId: number;
  admin: { id: number; first_name: string };
  org: { id: number; first_name: string };
  player: { id: number; first_name: string };
  orgUserId: number;
  playerUserId: number;
}

export async function setupApiWorld(): Promise<ApiWorld> {
  const tg = new FakeTg();
  const sync = new FakeSync();
  __setTgClientForTests(tg);
  setDepsFactoryForTests(env => ({ db: getDb(env.DB), now: Date.now(), sync }));
  const c = await seedCommunity();
  await seedUser('Админ', { communityId: c.id, tgId: 1 });
  const o = await seedUser('Орг', { communityId: c.id, tgId: 2001, role: 'organizer' });
  const p = await seedUser('Игрок', { communityId: c.id, tgId: 2002 });
  return {
    tg, sync, communityId: c.id,
    admin: { id: 1, first_name: 'Админ' },
    org: { id: 2001, first_name: 'Орг' },
    player: { id: 2002, first_name: 'Игрок' },
    orgUserId: o.id,
    playerUserId: p.id,
  };
}

export function teardownApiWorld(): void {
  __setTgClientForTests(null);
  setDepsFactoryForTests(null);
}
