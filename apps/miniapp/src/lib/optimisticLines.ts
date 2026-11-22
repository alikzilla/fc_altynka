import type { BillDto, BillLineDto } from '@altynka/core';
import { useCallback, useMemo, useRef, useState } from 'react';

/** One payment mark already on screen: `settle` once the server accepted it, `rollback` if it refused. */
export type OptimisticMark = { settle: () => void; rollback: () => void };

type Pending = { paid: boolean; token: number; settled: boolean; base: BillDto | null };

const marked = (line: BillLineDto, paid: boolean): BillLineDto =>
  paid ? { ...line, paidAmount: line.amount, state: 'paid', due: 0 } : { ...line, paidAmount: null, state: 'unpaid', due: line.amount };

/**
 * Payment marks show at the tap and go to the server after. A pending mark wins over the loaded bill;
 * an accepted one stays until the next bill arrives from the server; a refused one disappears at once.
 */
export function useOptimisticLines(bill: BillDto | null) {
  const [pending, setPending] = useState<ReadonlyMap<number, Pending>>(() => new Map());
  const current = useRef(bill);
  current.current = bill;
  const seq = useRef(0);

  const view = useMemo(() => {
    if (!bill || !pending.size) return bill;
    const live = (p: Pending | undefined) => p && (!p.settled || p.base === bill);
    if (!bill.lines.some(l => live(pending.get(l.id)))) return bill;
    return { ...bill, lines: bill.lines.map(l => { const p = pending.get(l.id); return live(p) ? marked(l, p!.paid) : l; }) };
  }, [bill, pending]);

  const mark = useCallback((lineId: number, paid: boolean): OptimisticMark => {
    const token = ++seq.current;
    const own = (m: ReadonlyMap<number, Pending>) => m.get(lineId)?.token === token;
    setPending(m => new Map(m).set(lineId, { paid, token, settled: false, base: null }));
    return {
      // Remember which bill was on screen when the server answered: only a newer one replaces the mark.
      settle: () => setPending(m => own(m) ? new Map(m).set(lineId, { ...m.get(lineId)!, settled: true, base: current.current }) : m),
      rollback: () => setPending(m => { if (!own(m)) return m; const next = new Map(m); next.delete(lineId); return next; }),
    };
  }, []);

  return { bill: view, mark };
}
