export const ROUND_TO = 50;

export interface Extra {
  label: string;
  amount: number;
}

export interface BillPayerInput {
  userId: number;
  units: number;
}

export interface BillCalc {
  total: number;
  share: number;
  lines: { userId: number; units: number; amount: number }[];
}

/** Итог делится поровну на все доли; доля округляется вверх до 50 ₸. */
export function computeBill(fieldAmount: number, extras: Extra[], payers: BillPayerInput[]): BillCalc {
  const units = payers.reduce((s, p) => s + p.units, 0);
  if (units <= 0) throw new Error('bill has no payers');
  const total = fieldAmount + extras.reduce((s, x) => s + x.amount, 0);
  const share = Math.ceil(total / units / ROUND_TO) * ROUND_TO;
  return { total, share, lines: payers.map(p => ({ userId: p.userId, units: p.units, amount: share * p.units })) };
}

export type LineState = 'unpaid' | 'paid' | 'underpaid';

export function lineStatus(amount: number, paidAmount: number | null): { state: LineState; due: number } {
  if (paidAmount === null) return { state: 'unpaid', due: amount };
  if (paidAmount >= amount) return { state: 'paid', due: 0 };
  return { state: 'underpaid', due: amount - paidAmount };
}
