import { AWARDS, formatRating, type AwardPicks, type MatchReviewDto, type ReviewInput } from '@altynka/core';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import { useMe } from '../state/me';
import { api, ApiError } from '../lib/api';
import { useResource } from '../hooks/useResource';
import { resourceReceivedAt } from '../lib/queryClient';
import { Avatar } from '../components/Icon';
import { ReviewRater } from './ReviewRater';
import { MatchAwards } from '../components/MatchAwards';
import { ConfirmButton, ErrorNote, Screen } from '../components/ui';
import { ReviewSkeleton } from '../components/skeletons';

export function MatchReview({ eventId: givenId }: { eventId?: number }) {
  const params = useParams<{ id: string }>();
  const eventId = givenId ?? Number(params.id);
  const me = useMe();
  const { data, error, loading, reload, replace } = useResource<MatchReviewDto>(`/api/events/${eventId}/review`);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [awardsOpen, setAwardsOpen] = useState(false);
  const [saved, setSaved] = useState<MatchReviewDto | null>(null);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [gameScore, setGameScore] = useState<number | null>(null);
  const [awards, setAwards] = useState<AwardPicks>({});
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
  const picked = AWARDS.filter(key => awards[key] !== undefined).length;
  async function send(skipped = false) {
    if (locked.current || review?.state !== 'open') return;
    const input: ReviewInput = skipped ? { scores: [], gameScore: null, skipped: true } : {
      scores: Object.entries(scores).map(([userId, score]) => ({ userId: Number(userId), score })), gameScore, skipped: false,
      // Picks, or an explicit "went through the award step without picking": either way no late offer follows.
      ...(picked ? { awards } : review.participants.some(p => p.userId !== me.userId) ? { awardsSkipped: true as const } : {}),
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
  async function sendAwards() {
    if (locked.current || !review?.canAddAwards) return;
    locked.current = true; setBusy(true); setFailure(null);
    try {
      const result = await api.send<MatchReviewDto>('POST', `/api/events/${eventId}/review/awards`, picked ? { awards } : { skipped: true });
      setSaved(result); replace(result); setAwardsOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) { setFailure('Опрос уже закрыт или награды отправлены. Обновляем результат.'); setAwardsOpen(false); reload(); }
      else setFailure('Не получилось отправить. Выбор сохранён на экране — попробуй ещё раз.');
    } finally { locked.current = false; setBusy(false); }
  }
  async function close() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setFailure(null);
    try { const result = await api.send<MatchReviewDto>('POST', `/api/events/${eventId}/review/close`); setSaved(result); replace(result); }
    catch (err) {
      if (err instanceof ApiError && err.status === 409) reload();
      else setFailure('Не получилось закрыть опрос. Попробуй ещё раз.');
    } finally { locked.current = false; setBusy(false); }
  }
  const answered = review?.participants.filter(p => p.voted).length ?? 0;
  return <Screen title="Оценка матча" back={`/event/${eventId}`}>
    {loading && !review && <ReviewSkeleton />}{error && <ErrorNote text="Не получилось загрузить опрос" retry={reload} />}
    {review && (review.state === 'open' ? <>
      <div className="card material-blue"><h2>Как прошёл матч?</h2><p>Оцени, как сыграл каждый участник, от 1 до 10. В конце выбери лучших игроков матча. Твоё имя рядом с оценками и выбором никто не увидит.</p><p className="muted">Можно пропустить любого игрока. После отправки изменить ответы нельзя.</p><p className="muted">До {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' }).format(review.closesAt!)} · Алматы</p></div>
      <section className="card review-entry-card" aria-labelledby="review-entry-title">
        <h2 id="review-entry-title">Оценка игроков</h2>
        <div className="review-entry-players">{review.participants.filter(p => p.userId !== me.userId).slice(0, 4).map(person => <Avatar key={person.userId} name={person.name} photoUrl={person.photoUrl} />)}<span className="muted">Оценено {Object.keys(scores).length} из {review.participants.filter(p => p.userId !== me.userId).length}</span></div>
        <p className="muted">По одному игроку за раз. Затем награды и впечатление от матча в целом.</p>
        {picked > 0 && <p className="muted">Награды: {picked} из {AWARDS.length}</p>}
        {gameScore !== null && <p className="muted">Матч в целом: {gameScore} / 10</p>}
        <button className="btn primary wide" onClick={() => setRatingOpen(true)}>{Object.keys(scores).length || picked || gameScore !== null ? 'Продолжить оценку' : 'Оценить'}</button>
      </section>
      {failure && !ratingOpen && <p className="field-error" role="alert">{failure}</p>}
      {ratingOpen && <ReviewRater players={review.participants.filter(p => p.userId !== me.userId)} scores={scores} gameScore={gameScore} awards={awards} busy={busy} error={failure}
        onAward={(award, userId) => setAwards(current => { const next = { ...current }; if (userId === null) delete next[award]; else next[award] = userId; return next; })}
        onScore={(userId, value) => setScores(current => { const next = { ...current }; if (value === null) delete next[userId]; else next[userId] = value; return next; })}
        onGameScore={setGameScore} onClose={() => setRatingOpen(false)} onSubmit={() => send()} />}

      <ConfirmButton className="btn-text" label="Пропустить опрос" confirmLabel="Пропустить без оценок?" disabled={busy} onConfirm={() => send(true)} />
    </> : review.state === 'submitted' && review.canAddAwards ? <>
      <section className="card material-blue review-late-awards" aria-labelledby="review-late-awards-title">
        <h2 id="review-late-awards-title">Выбери лучших игроков матча</h2>
        <p>Твои оценки уже у нас. Осталось выбрать MVP и лучших по позициям. Рядом с каждым игроком видны его голы и пасы за матч.</p>
        <p className="muted">Анонимно, как и оценки. Выбрать можно один раз{review.closesAt ? `, до ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' }).format(review.closesAt)} · Алматы` : ''}.</p>
        {picked > 0 && !awardsOpen && <p className="muted">Выбрано наград: {picked} из {AWARDS.length}</p>}
        <button className="btn primary wide" onClick={() => setAwardsOpen(true)}>{picked ? 'Продолжить выбор' : 'Выбрать лучших'}</button>
      </section>
      {failure && !awardsOpen && <p className="field-error" role="alert">{failure}</p>}
      {awardsOpen && <ReviewRater mode="awards" players={review.participants.filter(p => p.userId !== me.userId)} scores={review.ownSubmission ? Object.fromEntries(review.ownSubmission.scores.map(s => [s.userId, s.score])) : {}} gameScore={null} awards={awards} busy={busy} error={failure}
        onAward={(award, userId) => setAwards(current => { const next = { ...current }; if (userId === null) delete next[award]; else next[award] = userId; return next; })}
        onScore={() => {}} onGameScore={() => {}} onClose={() => setAwardsOpen(false)} onSubmit={sendAwards} />}
    </> : review.state === 'submitted' || review.state === 'skipped' ? <section className="card material-blue review-done"><h2>{review.state === 'submitted' ? 'Спасибо, оценки отправлены' : 'Опрос пропущен'}</h2><p className="muted">{review.state === 'submitted' ? 'Твоё имя рядом с оценками никто не увидит. Средние появятся, когда ответят все участники или закончится голосование, и наберётся минимум три оценки на игрока.' : 'Средние появятся, когда ответят все участники или закончится голосование, и наберётся минимум три оценки на игрока.'}</p>{review.closesAt && <p className="muted">Голосование до {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' }).format(review.closesAt)} · Алматы</p>}<Link className="btn wide" href={`/event/${eventId}`}>К матчу</Link></section>
      : review.state === 'closed' ? <>{review.awards && <MatchAwards awards={review.awards} />}<section className="rating-history"><h2>Оценки за матч</h2><p className="muted">Показаны средние при наличии минимум трёх оценок. Авторы и отдельные голоса скрыты.</p><ul className="card list">{review.participants.map(person => <li key={person.userId}><Link className="rating-history-row" href={`/players/${person.userId}`}><span>{person.name}</span><span className={person.score === null ? 'muted rating-insufficient' : 'rating-small'}>{person.score === null ? 'Недостаточно оценок' : formatRating(person.score)}</span></Link></li>)}</ul><div className="card"><h3>Матч в целом</h3><p>{review.gameScore === null ? 'Недостаточно оценок' : `${formatRating(review.gameScore)} / 10`}</p></div></section></>
      : <section className="card"><h2>{review.state === 'ineligible' ? 'Опрос для участников матча' : review.state === 'legacy' ? 'Для этого матча опрос недоступен' : 'Ждём завершения матча'}</h2><p className="muted">Оценки доступны после подтверждения организатором фактических участников матча.</p><Link className="btn wide" href={`/event/${eventId}`}>К матчу</Link></section>)}
    {review?.canClose && review.state !== 'closed' && <section className="card review-progress-card" aria-labelledby="review-progress-title">
      <h2 id="review-progress-title">Кто ответил</h2>
      <p className="muted">Ответили {answered} из {review.participants.length}. Видно только тебе как организатору; сами оценки скрыты. Когда все ответят и выберут награды, итоги откроются сразу.</p>
      <ul className="review-progress-list">{review.participants.map(person => <li key={person.userId}><Avatar name={person.name} photoUrl={person.photoUrl} /><span>{person.name}</span><span className={person.voted && !person.awardsPending ? 'review-voted' : 'muted'}>{person.awardsPending ? 'Ждём награды' : person.voted ? 'Ответил' : 'Ждём'}</span></li>)}</ul>
      <p className="muted">Опрос можно закрыть раньше срока. Итоги откроются сразу, а те, кто не успел, оценить уже не смогут. Отменить закрытие нельзя.</p>
      {failure && review.state !== 'open' && <p className="field-error" role="alert">{failure}</p>}
      <ConfirmButton className="btn wide" label="Закрыть опрос" confirmLabel="Закрыть и показать итоги?" disabled={busy} onConfirm={close} />
    </section>}
  </Screen>;
}
