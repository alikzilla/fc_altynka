import { formatRating, selfAssessmentRating, SKILLS, type PlayerRatingDto, type SkillAnswers } from '@altynka/core';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { api, ApiError } from '../lib/api';
import { useMe, useReloadMe, useUpdateMe } from '../state/me';
import { Screen } from '../components/ui';
import { RatingSummary, SkillBreakdown } from '../components/PlayerRating';
import { RatingSlider } from '../components/RatingSlider';
import { MatchAction } from '../components/MatchAction';
import { ActionSheet } from '../components/ActionSheet';

export function SkillAssessment() {
  const me = useMe();
  const updateMe = useUpdateMe();
  const reloadMe = useReloadMe();
  const [path, navigate] = useLocation();
  const currentPath = useRef(path); currentPath.current = path;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [answers, setAnswers] = useState<Partial<SkillAnswers>>({});
  const [step, setStep] = useState(0);
  const [summary, setSummary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step, summary]);
  async function save() {
    if (locked.current || SKILLS.some(s => answers[s.key] === undefined)) return;
    locked.current = true; setBusy(true); setError(null);
    try {
      const rating = await api.send<PlayerRatingDto>('PUT', '/api/me/skills', answers);
      updateMe(current => ({ ...current, rating })); reloadMe();
      if (mounted.current && currentPath.current === path) navigate('/profile');
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'already_assessed' ? 'Анкета уже сохранена. Обнови профиль, чтобы увидеть результат.' : 'Не получилось сохранить. Ответы на месте — попробуй ещё раз.');
    } finally { locked.current = false; setBusy(false); }
  }
  const skill = SKILLS[step];
  const selected = answers[skill.key];
  if (me.rating?.selfAssessment) return <Screen title="Характеристики" back="/profile"><RatingSummary rating={me.rating} /><SkillBreakdown rating={me.rating} /><Link className="btn wide" href="/profile">В профиль</Link></Screen>;
  return <Screen title="Твоя игра" back="/profile" className="skills-screen">
    {summary ? <>
      <section className="card material-blue rating-summary"><h2 ref={heading} tabIndex={-1}>Стартовый рейтинг</h2><strong className="rating-number">{formatRating(selfAssessmentRating(answers as SkillAnswers))}</strong><p className="muted">Из 10 · по твоим ответам. После матчей оценки игроков будут уточнять рейтинг.</p></section>
      <SkillBreakdown rating={{ value: 0, initial: 0, matchesCount: 0, selfAssessment: answers as SkillAnswers }} />
      <p className="muted">Проверь ответы: анкета заполняется один раз. Далее рейтинг меняется по оценкам матчей.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="btn primary wide" disabled={busy} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить характеристики'}</button>
      <button className="btn-text" disabled={busy} onClick={() => { setSummary(false); setStep(0); }}>Изменить ответы</button>
    </> : <>
      <div className="skills-progress"><span className="muted">{step + 1} из {SKILLS.length}</span><progress aria-label="Прогресс анкеты" value={step + 1} max={SKILLS.length} /></div>
      <section className="card material-blue skill-question">
        <h2 ref={heading} tabIndex={-1}>{skill.label}</h2><p className="muted" id="skill-hint">{skill.hint}</p>
        <RatingSlider key={skill.key} label={skill.label} value={selected} onChange={value => setAnswers(current => ({ ...current, [skill.key]: value }))} />
      </section>
      <MatchAction label="Продолжение анкеты"><button className="btn primary wide" disabled={selected === undefined} onClick={() => step === SKILLS.length - 1 ? setSummary(true) : setStep(step + 1)}>{step === SKILLS.length - 1 ? 'Посмотреть результат' : 'Далее'}</button></MatchAction>
      {step > 0 && <button className="btn-text" onClick={() => setStep(step - 1)}>К предыдущему вопросу</button>}
    </>}
  </Screen>;
}

export function SkillsPrompt() {
  const me = useMe();
  const [path, navigate] = useLocation();
  const key = `altynka:skills-prompt:${me.userId}`;
  const [dismissed, setDismissed] = useState(() => { try { return sessionStorage.getItem(key) === 'later'; } catch { return false; } });
  const dismiss = () => { setDismissed(true); try { sessionStorage.setItem(key, 'later'); } catch { /* The prompt still closes when storage is unavailable. */ } };
  if (!me.rating || me.rating.selfAssessment || dismissed || !['/', '/matches', '/profile', '/players'].includes(path)) return null;
  return <ActionSheet title="Как ты играешь?" onClose={dismiss} footer={<div className="skills-prompt-actions"><button className="btn primary wide" onClick={() => { dismiss(); navigate('/profile/skills'); }}>Оценить свои навыки</button><button className="btn-text" onClick={dismiss}>Позже</button></div>}>
    <p>Восемь коротких вопросов о твоей игре помогут собрать равные команды.</p><p className="muted">Около минуты. Затем рейтинг будут уточнять анонимные оценки после матчей.</p>
  </ActionSheet>;
}
