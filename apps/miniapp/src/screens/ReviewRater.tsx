import { AWARDS, AWARD_LABEL, AWARD_QUESTION, AWARD_SHORT_LABEL, type AwardKey, type AwardPicks, type ReviewPlayerStats } from '@altynka/core';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ActionSheet } from '../components/ActionSheet';
import { AwardPicker } from '../components/AwardPicker';
import { Avatar, Icon } from '../components/Icon';
import { RatingSlider } from '../components/RatingSlider';
import { ReviewStatTiles } from '../components/ReviewStats';

type Props = {
  players: { userId: number; name: string; photoUrl?: string | null; stats?: ReviewPlayerStats }[];
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
  /** `awards` — только шаги наград к уже отправленным оценкам, затем сводка выбора. */
  mode?: 'full' | 'awards';
};

export function ReviewRater({ players, scores, gameScore, awards, onAward, onScore, onGameScore, onClose, onSubmit, busy, error, mode = 'full' }: Props) {
  const awardsOnly = mode === 'awards';
  // Rating steps come first in the full poll; the awards-only poll has none.
  const rated: Props['players'] = awardsOnly ? [] : players;
  // Reopening resumes at the first unanswered step: an unrated player, then an unpicked prize, else the final step.
  const [step, setStep] = useState(() => {
    const player = rated.findIndex(p => scores[p.userId] === undefined);
    if (player >= 0) return player;
    const prize = players.length ? AWARDS.findIndex(key => awards[key] === undefined) : -1;
    return rated.length + (prize >= 0 ? prize : players.length ? AWARDS.length : 0);
  });
  const [leaving, setLeaving] = useState(false);
  const [direction, setDirection] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const transitioning = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step]);
  // Players first, then one step per prize, then the match itself (or the summary of picks). Nobody else on the pitch means no prizes to give.
  const prizes: readonly AwardKey[] = players.length ? AWARDS : [];
  const person = rated[step] as Props['players'][number] | undefined;
  const award = person ? undefined : prizes[step - rated.length];
  const final = !person && !award;
  const total = rated.length + prizes.length + 1;
  const value = person ? scores[person.userId] : award ? awards[award] : awardsOnly ? undefined : gameScore ?? undefined;
  const ratedCount = rated.filter(p => scores[p.userId] !== undefined).length;
  const picked = prizes.filter(key => awards[key] !== undefined).length;
  const answered = awardsOnly || ratedCount > 0 || gameScore !== null;
  // The tallest steps are drawn invisibly under every step, so the sheet keeps one height: a prize (one row per player)
  // and a person with the stat tiles (with few players that one is taller than the list). The longest name wraps most.
  const ghostPerson = [...rated].sort((a, b) => Number(!!b.stats) - Number(!!a.stats) || b.name.length - a.name.length)[0] as Props['players'][number] | undefined;
  const tallest = prizes.length ? prizes.reduce((a, b) => AWARD_LABEL[b].length + AWARD_QUESTION[b].length > AWARD_LABEL[a].length + AWARD_QUESTION[a].length ? b : a) : null;
  // A row says «твоя оценка 10» once rated; the copy always shows the longest text, so rating a player never grows it.
  const worstScores = Object.fromEntries(players.map(p => [p.userId, 10]));
  const awardNote = 'Выбрать можно любого, кто играл. Имя автора останется скрытым, награды не меняют рейтинг.';
  const recap = !awardsOnly && `Оценено игроков: ${ratedCount} из ${rated.length}${rated.length - ratedCount ? ` · пропущено: ${rated.length - ratedCount}` : ''}${prizes.length ? ` · наград: ${picked} из ${prizes.length}` : ''} · матч ${gameScore === null ? 'без оценки' : `${gameScore} / 10`}`;
  const nameOf = (userId: number | undefined) => players.find(p => p.userId === userId)?.name;

  function move(next: number, immediate = false) {
    if (busy || transitioning.current || next < 0 || next >= total || next === step) return;
    setDirection(next > step ? 1 : -1);
    if (immediate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setStep(next); return; }
    transitioning.current = true; setLeaving(true);
    timer.current = setTimeout(() => { setStep(next); setLeaving(false); transitioning.current = false; }, 180);
  }
  const submitLabel = awardsOnly ? picked ? 'Отправить награды' : 'Отправить без наград' : 'Отправить оценки';
  return <ActionSheet title={awardsOnly ? 'Лучшие игроки матча' : 'Оценка матча'} onClose={onClose} busy={busy} footer={<div className="review-rater-footer">
    {error && <p className="field-error" role="alert">{error}</p>}
    {recap && <p className={`review-recap${final ? '' : ' sheet-stack-hidden'}`} aria-live="polite" aria-hidden={!final || undefined}>{recap}</p>}
    {!awardsOnly && <p className={`review-recap${final && !answered && picked > 0 ? '' : ' sheet-stack-hidden'}`} aria-hidden={!(final && !answered && picked > 0) || undefined}>Чтобы отправить, оцени хотя бы одного игрока или матч</p>}
    <button className="btn primary wide" disabled={busy || leaving || (final ? !answered : value === undefined)} onClick={event => { if (final) void onSubmit(); else move(step + 1, event.detail === 0); }}>
      {busy ? 'Отправляем…' : final ? submitLabel : 'Далее'}
    </button>
    <div className="review-step-actions">
      <button className="btn-text" disabled={busy || leaving || step === 0} onClick={event => move(step - 1, event.detail === 0)}><Icon name="back" />Назад</button>
      {final ? awardsOnly ? null : <button className="btn-text" disabled={busy || leaving || gameScore === null} onClick={() => onGameScore(null)}>Не оценивать игру</button>
        : award ? <button className="btn-text" disabled={busy || leaving} onClick={event => { onAward(award, null); move(step + 1, event.detail === 0); }}>Пропустить награду</button>
        : <button className="btn-text" disabled={busy || leaving} onClick={event => { onScore(person!.userId, null); move(step + 1, event.detail === 0); }}>Пропустить игрока</button>}
    </div>
  </div>}>
    <div className="skills-progress review-progress"><span className="muted">{step + 1} из {total}</span><progress value={step + 1} max={total} aria-label="Прогресс оценки" /></div>
    <div className="sheet-stack review-stack">
      <div>
        <div className="review-step-window">
          <section key={step} className={`card material-blue review-step ${leaving ? 'is-leaving' : ''}`} style={{ '--step-direction': direction } as CSSProperties}>
            <div className="review-person">{person && <Avatar name={person.name} photoUrl={person.photoUrl} />}<div><h3 ref={heading} tabIndex={-1}>{person ? person.name : award ? AWARD_LABEL[award] : awardsOnly ? 'Твой выбор' : 'Матч в целом'}</h3><p className="muted">{person ? 'Как проявил себя в этом матче?' : award ? AWARD_QUESTION[award] : awardsOnly ? 'Проверь и отправь. Изменить выбор после отправки нельзя.' : 'Твоё общее впечатление от матча'}</p></div></div>
            {person?.stats && <ReviewStatTiles stats={person.stats} />}
            {award ? <AwardPicker label={AWARD_LABEL[award]} players={players} scores={scores} value={awards[award]} disabled={busy || leaving} onChange={userId => onAward(award, userId)} />
              : final && awardsOnly ? <ul className="review-award-summary">{prizes.map(key => <li key={key}><span>{AWARD_SHORT_LABEL[key]}</span><span className={awards[key] === undefined ? 'muted' : undefined}>{nameOf(awards[key]) ?? 'не выбрано'}</span></li>)}</ul>
              : <RatingSlider label={person ? `Оценка: ${person.name}` : 'Матч в целом'} value={value} disabled={busy || leaving} kind={person ? 'player' : 'match'}
                onChange={next => person ? onScore(person.userId, next) : onGameScore(next)} />}
          </section>
      </div>
      <p className="muted review-rater-note">{final ? awardsOnly ? 'Имя автора останется скрытым, награды не меняют рейтинг. Отправка окончательная.' : 'Оценка матча не меняет рейтинг игроков. Отправка окончательная.' : award ? awardNote : 'Имя автора останется скрытым. Можно пропустить игрока или вернуться назад.'}</p>
      </div>
      {ghostPerson && <div className="sheet-stack-hidden" aria-hidden="true" inert>
        <div className="review-step-window"><section className="card material-blue review-step-ghost">
          <div className="review-person"><Avatar name={ghostPerson.name} photoUrl={ghostPerson.photoUrl} /><div><h3>{ghostPerson.name}</h3><p className="muted">Как проявил себя в этом матче?</p></div></div>
          {ghostPerson.stats && <ReviewStatTiles stats={ghostPerson.stats} />}
          <RatingSlider label={`Оценка: ${ghostPerson.name}`} value={undefined} disabled kind="player" onChange={() => {}} />
        </section></div>
        <p className="muted review-rater-note">Имя автора останется скрытым. Можно пропустить игрока или вернуться назад.</p>
      </div>}
      {tallest && <div className="sheet-stack-hidden" aria-hidden="true" inert>
        <div className="review-step-window"><section className="card material-blue review-step-ghost">
          <div className="review-person"><div><h3>{AWARD_LABEL[tallest]}</h3><p className="muted">{AWARD_QUESTION[tallest]}</p></div></div>
          <AwardPicker name="award-ghost" label={AWARD_LABEL[tallest]} players={players} scores={worstScores} value={undefined} disabled onChange={() => {}} />
        </section></div>
        <p className="muted review-rater-note">{awardNote}</p>
      </div>}
    </div>
  </ActionSheet>;
}
