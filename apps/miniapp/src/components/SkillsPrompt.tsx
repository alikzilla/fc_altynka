import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useMe } from '../state/me';
import { ActionSheet } from './ActionSheet';

const JOINED_KEY = 'altynka:joined-match';
const JOINED_EVENT = 'altynka:joined-match';

/** Called after a successful signup: the skills prompt may now ask its eight questions. */
export function noteJoinedMatch() {
  try { sessionStorage.setItem(JOINED_KEY, '1'); } catch { /* The event below still shows the prompt this session. */ }
  window.dispatchEvent(new Event(JOINED_EVENT));
}

export function SkillsPrompt() {
  const me = useMe();
  const [path, navigate] = useLocation();
  const key = `altynka:skills-prompt:${me.userId}`;
  const [dismissed, setDismissed] = useState(() => { try { return sessionStorage.getItem(key) === 'later'; } catch { return false; } });
  // First things first: the prompt waits until the person has signed up for a match, then appears on that match.
  const [joined, setJoined] = useState(() => { try { return sessionStorage.getItem(JOINED_KEY) === '1'; } catch { return false; } });
  useEffect(() => {
    const onJoined = () => setJoined(true);
    window.addEventListener(JOINED_EVENT, onJoined);
    return () => window.removeEventListener(JOINED_EVENT, onJoined);
  }, []);
  const dismiss = () => { setDismissed(true); try { sessionStorage.setItem(key, 'later'); } catch { /* The prompt still closes when storage is unavailable. */ } };
  const place = ['/profile', '/players'].includes(path) || joined && (path === '/' || path.startsWith('/event/') && !path.endsWith('/review'));
  if (!me.rating || me.rating.selfAssessment || dismissed || !place) return null;
  return <ActionSheet title="Как ты играешь?" onClose={dismiss} footer={<div className="skills-prompt-actions"><button className="btn primary wide" onClick={() => { dismiss(); navigate('/profile/skills'); }}>Оценить свои навыки</button><button className="btn-text" onClick={dismiss}>Позже</button></div>}>
    <p>Восемь коротких вопросов о твоей игре помогут собрать равные команды.</p><p className="muted">Около минуты. Затем рейтинг будут уточнять анонимные оценки после матчей.</p>
  </ActionSheet>;
}
