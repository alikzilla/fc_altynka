import { formatRating, type MatchReviewDto, type ReviewInput } from '@altynka/core';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import { useMe } from '../state/me';
import { api, ApiError } from '../lib/api';
import { useResource } from '../hooks/useResource';
import { resourceReceivedAt } from '../lib/queryClient';
import { Avatar } from '../components/Icon';
import { ReviewRater } from './ReviewRater';
import { ConfirmButton, ErrorNote, Screen } from '../components/ui';
import { ReviewSkeleton } from '../components/skeletons';

export function MatchReview({ eventId: givenId }: { eventId?: number }) {
  const params = useParams<{ id: string }>();
  const eventId = givenId ?? Number(params.id);
  const me = useMe();
  const { data, error, loading, reload, replace } = useResource<MatchReviewDto>(`/api/events/${eventId}/review`);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [saved, setSaved] = useState<MatchReviewDto | null>(null);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [gameScore, setGameScore] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const locked = useRef(false);
  const review = data?.state === 'closed' ? data : saved ?? data;
  useEffect(() => {
    if (!data || data.state === 'closed' || data.closesAt === null) return;
    const elapsed = performance.now() - (resourceReceivedAt(data) ?? performance.now());
    const delay = Math.max(0, data.closesAt - data.serverNow - elapsed);
    const timer = setTimeout(reload, Math.min(delay + 20, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [data, reload]);
  async function send(skipped = false) {
    if (locked.current || review?.state !== 'open') return;
    const input: ReviewInput = skipped ? { scores: [], gameScore: null, skipped: true } : {
      scores: Object.entries(scores).map(([userId, score]) => ({ userId: Number(userId), score })), gameScore, skipped: false,
    };
    if (!skipped && input.scores.length === 0 && input.gameScore === null) return;
    locked.current = true; setBusy(true); setFailure(null);
    try {
      const result = await api.send<MatchReviewDto>('POST', `/api/events/${eventId}/review`, input);
      setSaved(result); replace(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) { setFailure('Опрос уже закрыт или отправлен. Обновляем результат.'); reload(); }
      else setFailure('Не получилось отправить. Оценки сохранены на экране — попробуй ещё раз.');
    } finally { locked.current = false; setBusy(false); }
  }
  return <Screen title="Оценка матча" back={`/event/${eventId}`}>
    {loading && !review && <ReviewSkeleton />}{error && <ErrorNote text="Не получилось загрузить опрос" retry={reload} />}
    {review && (review.state === 'open' ? <>
      <div className="card material-blue"><h2>Как прошёл матч?</h2><p>Оцени, как сыграл каждый участник, от 1 до 10. Твоё имя рядом с оценками никто не увидит.</p><p className="muted">Можно пропустить любого игрока. После отправки изменить ответы нельзя.</p><p className="muted">До {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' }).format(review.closesAt!)} · Алматы</p></div>
      <section className="card review-entry-card" aria-labelledby="review-entry-title">
        <h2 id="review-entry-title">Оценка игроков</h2>
        <div className="review-entry-players">{review.participants.filter(p => p.userId !== me.userId).slice(0, 4).map(person => <Avatar key={person.userId} name={person.name} photoUrl={person.photoUrl} />)}<span className="muted">Оценено {Object.keys(scores).length} из {review.participants.filter(p => p.userId !== me.userId).length}</span></div>
        <p className="muted">По одному игроку за раз. В конце — впечатление от матча в целом.</p>
        {gameScore !== null && <p className="muted">Матч в целом: {gameScore} / 10</p>}
        <button className="btn primary wide" onClick={() => setRatingOpen(true)}>{Object.keys(scores).length || gameScore !== null ? 'Продолжить оценку' : 'Оценить'}</button>
      </section>
      {failure && !ratingOpen && <p className="field-error" role="alert">{failure}</p>}
      {ratingOpen && <ReviewRater players={review.participants.filter(p => p.userId !== me.userId)} scores={scores} gameScore={gameScore} busy={busy} error={failure}
        onScore={(userId, value) => setScores(current => { const next = { ...current }; if (value === null) delete next[userId]; else next[userId] = value; return next; })}
        onGameScore={setGameScore} onClose={() => setRatingOpen(false)} onSubmit={() => send()} />}

      <ConfirmButton className="btn-text" label="Пропустить опрос" confirmLabel="Пропустить без оценок?" disabled={busy} onConfirm={() => send(true)} />
    </> : review.state === 'submitted' || review.state === 'skipped' ? <section className="card material-blue review-done"><h2>{review.state === 'submitted' ? 'Спасибо, оценки отправлены' : 'Опрос пропущен'}</h2><p className="muted">{review.state === 'submitted' ? 'Твоё имя рядом с оценками никто не увидит. Средние появятся, когда голосование закончится и наберётся минимум три оценки на игрока.' : 'Средние появятся, когда голосование закончится и наберётся минимум три оценки на игрока.'}</p>{review.closesAt && <p className="muted">Голосование до {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' }).format(review.closesAt)} · Алматы</p>}<Link className="btn wide" href={`/event/${eventId}`}>К матчу</Link></section>
      : review.state === 'closed' ? <section className="rating-history"><h2>Оценки за матч</h2><p className="muted">Показаны средние при наличии минимум трёх оценок. Авторы и отдельные голоса скрыты.</p><ul className="card list">{review.participants.map(person => <li key={person.userId}><Link className="rating-history-row" href={`/players/${person.userId}`}><span>{person.name}</span><span className={person.score === null ? 'muted rating-insufficient' : 'rating-small'}>{person.score === null ? 'Недостаточно оценок' : formatRating(person.score)}</span></Link></li>)}</ul><div className="card"><h3>Матч в целом</h3><p>{review.gameScore === null ? 'Недостаточно оценок' : `${formatRating(review.gameScore)} / 10`}</p></div></section>
      : <section className="card"><h2>{review.state === 'ineligible' ? 'Опрос для участников матча' : review.state === 'legacy' ? 'Для этого матча опрос недоступен' : 'Ждём завершения матча'}</h2><p className="muted">Оценки доступны после подтверждения организатором фактических участников матча.</p><Link className="btn wide" href={`/event/${eventId}`}>К матчу</Link></section>)}
  </Screen>;
}
