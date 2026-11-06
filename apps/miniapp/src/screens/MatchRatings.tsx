import { formatRating, type EventDetailDto } from '@altynka/core';
import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { ActionSheet } from '../components/ActionSheet';
import { api } from '../lib/api';

export function MatchRatings({ ev, reload }: { ev: EventDetailDto; reload: () => void }) {
  const review = ev.review;
  const [finishing, setFinishing] = useState(false);
  const [selected, setSelected] = useState<number[]>(ev.main.map(s => s.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  if (!review || review.state === 'legacy' || review.state === 'pending' && !review.canFinish) return null;
  async function finish() {
    if (locked.current || !selected.length) return;
    locked.current = true; setBusy(true); setError(null);
    try { await api.send('POST', `/api/events/${ev.id}/finish`, { participantSignupIds: selected }); setFinishing(false); reload(); }
    catch { setError('Не получилось завершить игру. Проверь участников и попробуй ещё раз.'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <>
    <section className="card match-rating-entry" aria-label="Оценки матча">
      <h2>{review.canFinish ? 'Игра закончилась?' : review.state === 'open' ? 'Как прошла игра?' : review.state === 'closed' ? 'Оценки матча' : 'После игры'}</h2>
      <p className="muted">{review.canFinish ? 'Подтверди тех, кто вышел на поле, чтобы открыть анонимные оценки.' : review.state === 'open' ? 'Оцени участников и сам матч. Можно пропустить любого игрока.' : review.state === 'submitted' ? 'Твои оценки отправлены. Итоги появятся после окончания голосования.' : review.state === 'skipped' ? 'Ты пропустил опрос. Результаты появятся после окончания голосования.' : review.state === 'closed' ? review.gameScore === null ? 'Голосование завершено. Итоги доступны при наличии минимум трёх оценок.' : `Игра в целом — ${formatRating(review.gameScore)} / 10` : 'Анонимный опрос открыт для подтверждённых участников матча.'}</p>
      {review.canFinish ? <button className="btn wide" onClick={() => { setSelected(ev.main.map(s => s.id)); setFinishing(true); }}>Завершить игру</button>
        : <Link className={`btn wide ${review.state === 'open' ? 'primary' : ''}`} href={`/event/${ev.id}/review`}>{review.state === 'open' ? 'Оценить игру' : review.state === 'closed' ? 'Посмотреть оценки' : 'Открыть опрос'}</Link>}
    </section>
    {finishing && <ActionSheet title="Кто играл?" onClose={() => setFinishing(false)} busy={busy} footer={<button className="btn primary wide" disabled={busy || !selected.length} onClick={finish}>{busy ? 'Подтверждаем…' : 'Подтвердить участников'}</button>}>
      <p className="muted">Убери тех, кто не пришёл, и отметь сыгравших из резерва. Список фиксируется; оплата на него не влияет.</p>
      <fieldset className="form-fields finish-roster" disabled={busy}>{[...ev.main, ...ev.reserve].map(person => <label className="finish-person" key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={e => setSelected(current => e.target.checked ? [...current, person.id] : current.filter(id => id !== person.id))} /><span>{person.name}{ev.reserve.some(s => s.id === person.id) && <small className="muted"> · из резерва</small>}{person.userId === null && <small className="muted"> · гость</small>}</span></label>)}</fieldset>
      {error && <p className="field-error" role="alert">{error}</p>}
    </ActionSheet>}
  </>;
}
