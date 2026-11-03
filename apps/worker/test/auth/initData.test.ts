import { verifyInitData } from '../../src/auth/initData';
import { signInitData } from '../helpers';

const u = { id: 42, first_name: 'Азамат' };

test('accepts valid signature', async () => {
  const raw = await signInitData(u, 'test-token', 1_700_000_000);
  expect(await verifyInitData(raw, 'test-token', 1_700_000_100)).toMatchObject({ id: 42, first_name: 'Азамат' });
});

test('rejects tampered, wrong token, expired', async () => {
  const raw = await signInitData(u, 'test-token', 1_700_000_000);
  expect(await verifyInitData(raw.replace('42', '43'), 'test-token', 1_700_000_100)).toBeNull();
  expect(await verifyInitData(raw, 'other', 1_700_000_100)).toBeNull();
  expect(await verifyInitData(raw, 'test-token', 1_700_000_000 + 86_401)).toBeNull();
});

test('rejects garbage', async () => {
  expect(await verifyInitData('', 'test-token', 1)).toBeNull();
  expect(await verifyInitData('user=%7B&hash=zz', 'test-token', 1)).toBeNull();
});
