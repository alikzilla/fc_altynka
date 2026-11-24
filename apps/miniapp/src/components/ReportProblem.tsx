import { useId, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { haptic } from '../lib/tg';
import { APP_VERSION } from '../lib/version';
import { ActionSheet } from './ActionSheet';
import { useToast } from './ui';

const LIMIT = 1000;

/** «Сообщить о проблеме»: текст уходит администратору в Telegram вместе с экраном и версией приложения. */
export function ReportProblemSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const hintId = useId();

  async function send() {
    if (!text.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.send('POST', '/api/feedback', { text: text.trim(), path: location.pathname, version: APP_VERSION });
      haptic('success');
      toast('Отправили. Спасибо!');
      onClose();
    } catch (e) {
      haptic('error');
      const code = e instanceof ApiError ? e.code : '';
      setError(code === 'too_often' ? 'Только что отправляли. Подожди полминуты и попробуй снова.'
        : code === 'feedback_off' ? 'Сообщения о проблемах сейчас не принимаются. Напиши организатору группы.'
        : 'Не получилось отправить. Попробуй ещё раз.');
    } finally { setBusy(false); }
  }

  return <ActionSheet title="Сообщить о проблеме" onClose={onClose} busy={busy} footer={<>
    {error && <p className="delete-data-error" role="alert">{error}</p>}
    <button type="button" className="btn wide" disabled={busy || !text.trim()} onClick={() => void send()}>{busy ? 'Отправляем…' : 'Отправить'}</button>
  </>}>
    <div className="form report-problem">
      <label htmlFor={fieldId}>Что случилось?</label>
      <textarea id={fieldId} aria-describedby={hintId} rows={5} maxLength={LIMIT} value={text} disabled={busy} onChange={e => setText(e.target.value)} placeholder="Например: после записи на матч не обновился список" />
      <p className="muted" id={hintId}>Сообщение придёт разработчику в Telegram вместе с твоим именем, группами и версией приложения ({APP_VERSION}). Он может ответить тебе в личку.</p>
    </div>
  </ActionSheet>;
}
