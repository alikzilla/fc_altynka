import { setDepsFactoryForTests } from '../../src/api/routes';
import { getDb } from '../../src/db/client';
import { __setTgClientForTests } from '../../src/telegram/client';
import { FakeSync } from '../fakes/fakeSync';
import { FakeTg } from '../fakes/fakeTg';
import { seedCommunity, seedUser } from '../helpers';
import { vi } from 'vitest';

export interface ApiWorld {
  clock: { now: number };
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
  const clock = { now: Date.parse('2026-11-07T05:00:00Z') };
  vi.spyOn(Date,'now').mockImplementation(()=>clock.now);
  setDepsFactoryForTests(env => ({ db: getDb(env.DB), now: clock.now, sync }));
  const c = await seedCommunity();
  await seedUser('Админ', { communityId: c.id, tgId: 1, telegramAdmin: true });
  const o = await seedUser('Орг', { communityId: c.id, tgId: 2001, role: 'organizer' });
  const p = await seedUser('Игрок', { communityId: c.id, tgId: 2002 });
  tg.members = new Set([1, 2001, 2002]);
  tg.admins.add(1);
  tg.chatMembers.set(c.tgChatId, tg.members);
  tg.chatAdmins.set(c.tgChatId, tg.admins);
  return {
    clock, tg, sync, communityId: c.id,
    admin: { id: 1, first_name: 'Админ' },
    org: { id: 2001, first_name: 'Орг' },
    player: { id: 2002, first_name: 'Игрок' },
    orgUserId: o.id,
    playerUserId: p.id,
  };
}

export function teardownApiWorld(): void {
  vi.restoreAllMocks();
  __setTgClientForTests(null);
  setDepsFactoryForTests(null);
}
