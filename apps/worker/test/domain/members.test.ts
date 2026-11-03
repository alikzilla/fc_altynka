import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema';
import { effectiveRole, ensureMembership, upsertTgUser } from '../../src/domain/members';
import { db, seedCommunity } from '../helpers';

test('upsertTgUser sets default display name once and never overwrites a custom one', async () => {
  const a = await upsertTgUser(db(), { id: 7, first_name: 'Дамир', last_name: 'Касымов' }, 1);
  expect(a.displayName).toBe('Дамир К.');
  await db().update(users).set({ displayName: 'Дамир-вратарь' }).where(eq(users.id, a.id));
  const b = await upsertTgUser(db(), { id: 7, first_name: 'Дамир', last_name: 'Новый' }, 2);
  expect(b.displayName).toBe('Дамир-вратарь');
  expect(b.lastName).toBe('Новый');
});

test('ensureMembership creates player with level 5, effectiveRole honours ADMIN_TG_ID', async () => {
  const c = await seedCommunity();
  const user = await upsertTgUser(db(), { id: 1, first_name: 'Админ' }, 1);
  const m = await ensureMembership(db(), c.id, user.id);
  expect(m).toMatchObject({ role: 'player', level: 5 });
  expect(await ensureMembership(db(), c.id, user.id)).toMatchObject({ role: 'player', level: 5 });
  expect(effectiveRole({ ADMIN_TG_ID: '1' }, user, m)).toBe('admin');
  expect(effectiveRole({ ADMIN_TG_ID: '999' }, user, m)).toBe('player');
});

test('a new user whose default name is taken gets a numbered one', async () => {
  expect((await upsertTgUser(db(), { id: 7, first_name: 'Данияр' }, 1)).displayName).toBe('Данияр');
  expect((await upsertTgUser(db(), { id: 8, first_name: 'данияр' }, 1)).displayName).toBe('данияр 2');
  expect((await upsertTgUser(db(), { id: 9, first_name: 'Данияр' }, 1)).displayName).toBe('Данияр 3');
  expect((await upsertTgUser(db(), { id: 8, first_name: 'данияр' }, 2)).displayName).toBe('данияр 2');
});
