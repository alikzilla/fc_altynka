import { renderBillMessage } from '../../src/render/billMessage';

const base = {
  share: 2000, receiver: { name: 'Азамат', kaspiPhone: '+77071234567' }, billId: 3, status: 'open' as const, date: '2026-11-07',
  lines: [
    { name: 'Азамат', units: 1, amount: 2000, state: 'paid' as const, due: 0 },
    { name: 'Тимур', units: 2, amount: 4000, state: 'unpaid' as const, due: 4000 },
    { name: 'A&B', units: 3, amount: 6000, state: 'underpaid' as const, due: 500 },
  ],
};

const env = { BOT_USERNAME: 'fc_altynka_bot', MINIAPP_SHORT_NAME: 'app' };

test('group bill shows share, receiver and payer progress without exposing individual debts', () => {
  const r = renderBillMessage(base, 5, env);
  expect(r.html).toContain('<b>Оплата · суббота, 7 ноября</b>');
  expect(r.html).toContain('С человека — <b>2 000 ₸</b>');
  expect(r.html).toContain('Получатель — Азамат');
  expect(r.html).toContain('+7 707 123 45 67');
  expect(r.html).toContain('Отметили оплату · 1 из 3');
  expect(r.html).not.toMatch(/Тимур|A&amp;B|4 000|6 000|500|доплатить|за себя/);
  const flat = r.keyboard!.inline_keyboard.flat();
  expect(flat).toEqual([
    { text: 'Открыть оплату', url: 'https://t.me/fc_altynka_bot/app?startapp=b5' },
    { text: 'Скопировать номер', copy_text: { text: '+77071234567' } },
  ]);
});

test('closed bill has no buttons', () => {
  const r = renderBillMessage({ ...base, status: 'closed' });
  expect(r.keyboard).toBeUndefined();
  expect(r.html).toContain('Счёт закрыт организатором');
  expect(r.html).not.toMatch(/Все отметили|Все скинули/);
});

test('closed bill with every payer marked says so without claiming bank receipt', () => {
  const r = renderBillMessage({ ...base, status: 'closed', lines: [base.lines[0]] }, 5, env);
  expect(r.html).toContain('Все отметили оплату · счёт закрыт');
  expect(r.html).not.toMatch(/получены|Все скинули/);
  expect(r.keyboard).toBeUndefined();
});

test('empty bill has no payment controls or all-paid claim', () => {
  const r = renderBillMessage({ ...base, lines: [] }, 5, env);
  expect(r.html).toContain('Нет долей для оплаты');
  expect(r.keyboard).toBeUndefined();
  expect(renderBillMessage({ ...base, status: 'closed', lines: [] }).html).not.toContain('Все отметили');
});

test('bill without a receiver phone has no copy button and says so', () => {
  const r = renderBillMessage({ ...base, receiver: { name: '<Азамат> & Co', kaspiPhone: '' } }, 5, env);
  expect(r.html).toContain('Kaspi не указан');
  expect(r.html).toContain('&lt;Азамат&gt; &amp; Co');
  const flat = r.keyboard!.inline_keyboard.flat();
  expect(flat.some(b => 'copy_text' in b)).toBe(false);
  expect(flat).toContainEqual(expect.objectContaining({ url: 'https://t.me/fc_altynka_bot/app?startapp=b5' }));
});

test('legacy bill callers do not receive an unsafe direct payment callback', () => {
  const flat = renderBillMessage(base).keyboard!.inline_keyboard.flat();
  expect(flat.some(b => 'callback_data' in b)).toBe(false);
  expect(flat).toEqual([{ text: 'Скопировать номер', copy_text: { text: '+77071234567' } }]);
});
