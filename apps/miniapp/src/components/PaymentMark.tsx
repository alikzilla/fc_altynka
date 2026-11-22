import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { haptic } from '../lib/tg';
import type { OptimisticMark } from '../lib/optimisticLines';
import { useToast } from './ui';

/**
 * «Я перевёл»: the payer's own declaration, not a bank check. After a trip to Kaspi the mark is
 * promoted to a visible button, and the payer can take it back for a short while.
 */
export function PaymentMark({ billId, returnedFromKaspi, canUndo, onChanged, optimistic, marked = false }: {
  billId: number; returnedFromKaspi: boolean; canUndo: boolean; onChanged: () => void;
  /** Shows the mark on screen right away; without it the button waits for the server. */
  optimistic?: (paid: boolean) => OptimisticMark;
  /** The line already reads as paid: the button hides, but the component stays mounted for the undo. */
  marked?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const locked = useRef(false);
  async function run(method: 'POST' | 'DELETE') {
    if (locked.current) return;
    locked.current = true; setFailure(null);
    const shown = optimistic?.(method === 'POST');
    if (shown) haptic('success'); else setBusy(true);
    try {
      await api.send(method, `/api/bills/${billId}/paid`);
      shown?.settle();
      if (!shown) haptic('success');
      if (method === 'DELETE') toast('Отметка об оплате снята');
      else toast('Оплата отмечена. Получатель сверит перевод', canUndo ? { action: { label: 'Отменить', onClick: () => void run('DELETE') } } : undefined);
    } catch {
      shown?.rollback();
      haptic('error');
      if (method === 'DELETE') toast('Отметку уже не снять. Напиши получателю', { tone: 'error' });
      else setFailure('Не получилось отметить оплату. Проверь интернет и попробуй ещё раз.');
    } finally { locked.current = false; setBusy(false); onChanged(); }
  }
  if (marked) return null;
  return <div className="payment-mark-block">
    {returnedFromKaspi
      ? <button className="btn wide payment-mark-prominent" onClick={() => run('POST')} disabled={busy}>{busy ? 'Отмечаем…' : 'Перевёл? Отметь оплату'}</button>
      : <button className="btn-text payment-mark" onClick={() => run('POST')} disabled={busy}>{busy ? 'Отмечаем…' : 'Я перевёл'}</button>}
    <p className="payment-mark-note">Отметку увидит получатель и сверит её с переводом в Kaspi.</p>
    {failure && <p className="field-error" role="alert">{failure}</p>}
  </div>;
}

/** True once the person comes back to the app after tapping «Перевести в Kaspi». */
export function useReturnFromKaspi() {
  const [left, setLeft] = useState(false);
  const [returned, setReturned] = useState(false);
  useEffect(() => {
    if (!left) return;
    const back = () => { if (document.visibilityState === 'visible') setReturned(true); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [left]);
  return { returned, onTransfer: () => setLeft(true) };
}
