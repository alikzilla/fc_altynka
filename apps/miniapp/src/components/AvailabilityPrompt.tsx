import { todayAlmaty, weekStart, type AvailabilityDto } from '@altynka/core';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useResource } from '../hooks/useResource';
import { useMe } from '../state/me';
import { ActionSheet } from './ActionSheet';

/**
 * Раз в неделю на главной: «отметь дни». Для тех, кто пропустил понедельничное сообщение бота
 * или не включил уведомления. Ответ («Позже» или переход в календарь) запоминается до следующего понедельника.
 */
export function AvailabilityPrompt() {
  const me = useMe();
  const [path, navigate] = useLocation();
  const key = `altynka:availability-prompt:${me.userId}`;
  const week = weekStart(todayAlmaty(new Date()));
  const [answered, setAnswered] = useState(() => { try { return localStorage.getItem(key) === week; } catch { return false; } });
  // Сначала анкета навыков: два листа подряд на первом входе — лишнее.
  const wanted = path === '/' && !answered && me.communities.length > 0 && !(me.rating && !me.rating.selfAssessment);
  const { data } = useResource<AvailabilityDto>(wanted ? '/api/availability' : null);
  if (!wanted || !data?.days?.some(day => !day.mark)) return null;
  const answer = () => { setAnswered(true); try { localStorage.setItem(key, week); } catch { /* Лист всё равно закрывается; без хранилища он появится при следующем входе. */ } };
  return <ActionSheet title="Когда сможешь играть?" onClose={answer} footer={<div className="skills-prompt-actions"><button className="btn primary wide" onClick={() => { answer(); navigate('/profile/availability'); }}>Отметить дни</button><button className="btn-text" onClick={answer}>Позже</button></div>}>
    <p>Отметь дни на эту неделю. Организатор увидит, кто может, и выберет день для игры.</p><p className="muted">В занятые дни бот не напишет о новом матче.</p>
  </ActionSheet>;
}
