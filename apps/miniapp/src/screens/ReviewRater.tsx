import { AWARDS, AWARD_LABEL, AWARD_QUESTION, type AwardKey, type AwardPicks } from '@altynka/core';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ActionSheet } from '../components/ActionSheet';
import { AwardPicker } from '../components/AwardPicker';
import { Avatar, Icon } from '../components/Icon';
import { RatingSlider } from '../components/RatingSlider';

type Props = {
  players: { userId: number; name: string; photoUrl?: string | null }[];
  scores: Record<number, number>;
  gameScore: number | null;
  awards: AwardPicks;
  onAward: (award: AwardKey, userId: number | null) => void;
  onScore: (userId: number, value: number | null) => void;
  onGameScore: (value: number | null) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  busy: boolean;
  error: string | null;
};

export function ReviewRater({ players, scores, gameScore, awards, onAward, onScore, onGameScore, onClose, onSubmit, busy, error }: Props) {
  const [step, setStep] = useState(() => { const first = players.findIndex(p => scores[p.userId] === undefined); return first < 0 ? players.length : first; });
  const [leaving, setLeaving] = useState(false);
  const [direction, setDirection] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const transitioning = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step]);
  // Players first, then one step per prize, then the match itself. Nobody else on the pitch means no prizes to give.
  const prizes: readonly AwardKey[] = players.length ? AWARDS : [];
  const person = players[step] as Props['players'][number] | undefined;
  const award = person ? undefined : prizes[step - players.length];
  const game = !person && !award;
  const total = players.length + prizes.length + 1;
  const value = person ? scores[person.userId] : award ? awards[award] : gameScore ?? undefined;
  const rated = players.filter(p => scores[p.userId] !== undefined).length;
  const picked = prizes.filter(key => awards[key] !== undefined).length;
  const answered = rated > 0 || gameScore !== null;

  function move(next: number, immediate = false) {
    if (busy || transitioning.current || next < 0 || next >= total || next === step) return;
    setDirection(next > step ? 1 : -1);
    if (immediate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setStep(next); return; }
    transitioning.current = true; setLeaving(true);
    timer.current = setTimeout(() => { setStep(next); setLeaving(false); transitioning.current = false; }, 180);
  }
  return <ActionSheet title="Оценка матча" onClose={onClose} busy={busy} footer={<div className="review-rater-footer">
    {error && <p className="field-error" role="alert">{error}</p>}
    {game && <p className="review-recap" aria-live="polite">Оценено игроков: {rated} из {players.length}{players.length - rated ? ` · пропущено: ${players.length - rated}` : ''}{prizes.length ? ` · наград: ${picked} из ${prizes.length}` : ''} · матч {gameScore === null ? 'без оценки' : `${gameScore} / 10`}</p>}
    {game && !answered && picked > 0 && <p className="review-recap">Чтобы отправить, оцени хотя бы одного игрока или матч</p>}
    <button className="btn primary wide" disabled={busy || leaving || (game ? !answered : value === undefined)} onClick={event => { if (game) void onSubmit(); else move(step + 1, event.detail === 0); }}>
      {busy ? 'Отправляем…' : game ? 'Отправить оценки' : 'Далее'}
    </button>
    <div className="review-step-actions">
      <button className="btn-text" disabled={busy || leaving || step === 0} onClick={event => move(step - 1, event.detail === 0)}><Icon name="back" />Назад</button>
      {game ? <button className="btn-text" disabled={busy || leaving || gameScore === null} onClick={() => onGameScore(null)}>Не оценивать игру</button>
        : award ? <button className="btn-text" disabled={busy || leaving} onClick={event => { onAward(award, null); move(step + 1, event.detail === 0); }}>Пропустить награду</button>
        : <button className="btn-text" disabled={busy || leaving} onClick={event => { onScore(person!.userId, null); move(step + 1, event.detail === 0); }}>Пропустить игрока</button>}
    </div>
  </div>}>
    <div className="skills-progress review-progress"><span className="muted">{step + 1} из {total}</span><progress value={step + 1} max={total} aria-label="Прогресс оценки" /></div>
    <div className="review-step-window">
      <section key={step} className={`card material-blue review-step ${leaving ? 'is-leaving' : ''}`} style={{ '--step-direction': direction } as CSSProperties}>
        <div className="review-person">{person && <Avatar name={person.name} photoUrl={person.photoUrl} />}<div><h3 ref={heading} tabIndex={-1}>{person ? person.name : award ? AWARD_LABEL[award] : 'Матч в целом'}</h3><p className="muted">{person ? 'Как проявил себя в этом матче?' : award ? AWARD_QUESTION[award] : 'Твоё общее впечатление от матча'}</p></div></div>
        {award ? <AwardPicker label={AWARD_LABEL[award]} players={players} scores={scores} value={awards[award]} disabled={busy || leaving} onChange={userId => onAward(award, userId)} />
          : <RatingSlider label={person ? `Оценка: ${person.name}` : 'Матч в целом'} value={value} disabled={busy || leaving} kind={person ? 'player' : 'match'}
            onChange={next => person ? onScore(person.userId, next) : onGameScore(next)} />}
      </section>
    </div>
    <p className="muted review-rater-note">{game ? 'Оценка матча не меняет рейтинг игроков. Отправка окончательная.' : award ? 'Выбрать можно любого, кто играл. Имя автора останется скрытым, награды не меняют рейтинг.' : 'Имя автора останется скрытым. Можно пропустить игрока или вернуться назад.'}</p>
  </ActionSheet>;
}
