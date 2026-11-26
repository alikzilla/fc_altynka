import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { closeApp, haptic } from '../lib/tg';
import { applyClub } from '../lib/theme';
import { ActionSheet } from './ActionSheet';

/**
 * «Удалить мои данные» (docs/superpowers/specs/2026-11-24-delete-my-data-design.md): что удалится, что останется
 * обезличенным, и одно подтверждение. После удаления этот профиль больше не существует — остаётся закрыть приложение.
 */
export function DeleteMyDataSheet({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true); setError(null);
    try {
      await api.send('DELETE', '/api/me', { confirm: 'delete' });
      // Клуб удалён и на сервере; кэш устройства тоже забываем, чтобы следующий запуск не красился им.
      applyClub(null);
      haptic('success');
      setDone(true);
    } catch (e) {
      haptic('error');
      setError(e instanceof ApiError && e.code === 'receiver_open_bill'
        ? 'Тебе ещё переводят деньги по открытому счёту. Попроси организатора закрыть счёт, потом удали данные.'
        : 'Не получилось удалить. Попробуй ещё раз.');
    } finally { setBusy(false); }
  }

  if (done) return <ActionSheet title="Данные удалены" step="done" onClose={closeApp} closeLabel="Закрыть приложение" footer={
    <button type="button" className="btn wide" onClick={closeApp}>Закрыть приложение</button>
  }>
    <p className="delete-data-copy">Профиль, номер Kaspi, анкета и настройки удалены. Если откроешь приложение снова, начнёшь с чистого профиля.</p>
  </ActionSheet>;

  return <ActionSheet title="Удалить мои данные?" step="confirm" onClose={onClose} busy={busy} footer={<>
    {error && <p className="delete-data-error" role="alert">{error}</p>}
    <button type="button" className="btn wide delete-data-confirm" disabled={busy} onClick={() => void remove()}>{busy ? 'Удаляем…' : 'Удалить навсегда'}</button>
  </>}>
    <div className="delete-data-copy">
      <p><b>Удалится:</b> профиль и фото, номер Kaspi, позиция, анкета навыков, календарь, настройки, реакции и посты ленты о тебе. Записи на будущие матчи отменятся.</p>
      <p><b>Останется без имени:</b> прошедшие матчи, статистика, счета и анонимные оценки — там будет «Удалённый игрок», чтобы у команды не сломались итоги.</p>
      <p>Отменить удаление нельзя.</p>
    </div>
  </ActionSheet>;
}
