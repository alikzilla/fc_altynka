import { renderBillMessage } from '../../src/render/billMessage';

const base = {
  share: 2000, receiver: { name: 'Азамат', kaspiPhone: '+77071234567' }, billId: 3, status: 'open' as const, date: '2026-11-07',
  lines: [
    { name: 'Азамат', units: 1, amount: 2000, state: 'paid' as const, due: 0 },
    { name: 'Тимур', units: 2, amount: 4000, state: 'unpaid' as const, due: 4000 },
    { name: 'A&B', units: 3, amount: 6000, state: 'underpaid' as const, due: 500 },
  ],
};

test('bill message: share, receiver, copy button, paid marks', () => {
  const r = renderBillMessage(base);
  expect(r.html).toContain('2 000 ₸');
  expect(r.html).toContain('+7 707 123 45 67');
  expect(r.html).toContain('за себя и друга');
  expect(r.html).toContain('за себя и 2 друзей');
  expect(r.html).toContain('A&amp;B');
  expect(r.html).toMatch(/доплатить 500/);
  const flat = r.keyboard!.inline_keyboard.flat();
  expect(flat[0]).toMatchObject({ copy_text: { text: '+77071234567' } });
  expect(flat[1]).toMatchObject({ callback_data: 'p:3' });
});

test('closed bill has no buttons', () => {
  const r = renderBillMessage({ ...base, status: 'closed' });
  expect(r.keyboard).toBeUndefined();
  expect(r.html).toContain('закрыт');
});
