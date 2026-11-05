import { useEffect, useState } from 'react';
import { useResource } from '../hooks/useResource';

type ReminderReport = {
  at: number;
  sent: number;
  unavailable: number;
  skipped: number;
  failed: number;
  status: 'queued' | 'complete' | 'retrying';
};

export function ReminderDelivery({ billId }: { billId: number }) {
  const { data, error, loading, reload } = useResource<{ report: ReminderReport | null }>(`/api/bills/${billId}/reminder-status`);
  const [stopped, setStopped] = useState(false);
  const [cycle, setCycle] = useState(0);
  const report = data?.report;
  const pending = report?.status === 'queued' || report?.status === 'retrying';

  useEffect(() => {
    if (!pending) return;
    setStopped(false);
    const poll = window.setInterval(reload, 2000);
    const deadline = window.setTimeout(() => {
      window.clearInterval(poll);
      setStopped(true);
    }, 30_000);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(deadline);
    };
  }, [pending, report?.at, cycle, reload]);

  const refresh = () => {
    setCycle(c => c + 1);
    reload();
  };
  return (
    <div className="muted" role="status" aria-live="polite">
      {report && <>
        <p>{report.status === 'queued' ? 'Напоминания в очереди. Доставка ещё не завершена.' : report.status === 'retrying' ? 'Доставка продолжается. Неотправленные напоминания будут повторены.' : 'Обработка напоминаний завершена.'}</p>
        <p>Отправлено в личный чат: {report.sent}. ЛС недоступны: {report.unavailable}. Пропущено за последние 24 часа: {report.skipped}.</p>
        {report.failed > 0 && <p>Пока не отправлено: {report.failed}.</p>}
      </>}
      {!data && loading && <p>Проверяем доставку напоминаний…</p>}
      <p>Напоминания — в личный чат. Если ЛС недоступны, предусмотрено общее напоминание в группе. Не чаще одного раза за 24 часа.</p>
      {error && <p>Не удалось обновить доставку. Проверь соединение и попробуй ещё раз.</p>}
      {stopped && pending && <p>Доставка ещё не завершена. Обнови статус позже.</p>}
      {(error || stopped && pending) && <button className="btn-text" disabled={loading} onClick={refresh}>Обновить доставку</button>}
    </div>
  );
}
