import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ActionSheet } from '../components/ActionSheet';
import { Avatar, Icon } from '../components/Icon';
import { RatingSlider } from '../components/RatingSlider';

type Props = {
  players: { userId: number; name: string; photoUrl?: string | null }[];
  scores: Record<number, number>;
  gameScore: number | null;
  onScore: (userId: number, value: number | null) => void;
  onGameScore: (value: number | null) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  busy: boolean;
  error: string | null;
};

export function ReviewRater({ players, scores, gameScore, onScore, onGameScore, onClose, onSubmit, busy, error }: Props) {
  const [step, setStep] = useState(() => { const first = players.findIndex(p => scores[p.userId] === undefined); return first < 0 ? players.length : first; });
  const [leaving, setLeaving] = useState(false);
  const [direction, setDirection] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const transitioning = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step]);
  const person = players[step];
  const game = step === players.length;
  const value = game ? gameScore ?? undefined : scores[person.userId];
  const total = players.length + 1;
  const rated = players.filter(p => scores[p.userId] !== undefined).length;

  function move(next: number, immediate = false) {
    if (busy || transitioning.current || next < 0 || next >= total || next === step) return;
    setDirection(next > step ? 1 : -1);
    if (immediate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setStep(next); return; }
    transitioning.current = true; setLeaving(true);
    timer.current = setTimeout(() => { setStep(next); setLeaving(false); transitioning.current = false; }, 180);
  }
  const change = (next: number) => game ? onGameScore(next) : onScore(person.userId, next);
  return <ActionSheet title="Оценка игроков" onClose={onClose} busy={busy} footer={<div className="review-rater-footer">
    {error && <p className="field-error" role="alert">{error}</p>}
    {game && <p className="review-recap" aria-live="polite">Оценено игроков: {rated} из {players.length}{players.length - rated ? ` · пропущено: ${players.length - rated}` : ''} · матч {gameScore === null ? 'без оценки' : `${gameScore} / 10`}</p>}
    <button className="btn primary wide" disabled={busy || leaving || (game ? !Object.keys(scores).length && gameScore === null : value === undefined)} onClick={event => { if (game) void onSubmit(); else move(step + 1, event.detail === 0); }}>
      {busy ? 'Отправляем…' : game ? 'Отправить оценки' : 'Далее'}
    </button>
    <div className="review-step-actions">
      <button className="btn-text" disabled={busy || leaving || step === 0} onClick={event => move(step - 1, event.detail === 0)}><Icon name="back" />Назад</button>
      {game ? <button className="btn-text" disabled={busy || leaving || gameScore === null} onClick={() => onGameScore(null)}>Не оценивать игру</button>
        : <button className="btn-text" disabled={busy || leaving} onClick={event => { onScore(person.userId, null); move(step + 1, event.detail === 0); }}>Пропустить игрока</button>}
    </div>
  </div>}>
    <div className="skills-progress review-progress"><span className="muted">{step + 1} из {total}</span><progress value={step + 1} max={total} aria-label="Прогресс оценки" /></div>
    <div className="review-step-window">
      <section key={step} className={`card material-blue review-step ${leaving ? 'is-leaving' : ''}`} style={{ '--step-direction': direction } as CSSProperties}>
        <div className="review-person">{!game && <Avatar name={person.name} photoUrl={person.photoUrl} />}<div><h3 ref={heading} tabIndex={-1}>{game ? 'Матч в целом' : person.name}</h3><p className="muted">{game ? 'Твоё общее впечатление от матча' : 'Как проявил себя в этом матче?'}</p></div></div>
        <RatingSlider label={game ? 'Матч в целом' : `Оценка: ${person.name}`} value={value} disabled={busy || leaving} kind={game ? 'match' : 'player'}
          onChange={change} />
      </section>
    </div>
    <p className="muted review-rater-note">{game ? 'Оценка матча не меняет рейтинг игроков. Отправка окончательная.' : 'Имя автора останется скрытым. Можно пропустить игрока или вернуться назад.'}</p>
  </ActionSheet>;
}
