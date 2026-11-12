import {
  DAY_PARTS, DAY_PART_LABEL, WEEKDAY_SHORT, availabilityLabel, formatDateRu, normalizeMark, weekdayOf,
  type AvailabilityDto, type AvailabilityMark, type AvailabilityStatus, type DayPart,
} from '@altynka/core';
import { useRef, useState } from 'react';
import { ActionSheet } from '../components/ActionSheet';
import { AvailabilityGrid } from '../components/AvailabilityGrid';
import { ErrorNote, Skeleton, Sk, useToast } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { api } from '../lib/api';
import { haptic } from '../lib/tg';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Три состояния дня. «Могу» сохраняется только вместе со временем: `choosing` — «Могу» нажато,
 * но окно ещё не выбрано, и на сервере день остаётся неотмеченным.
 */
function MarkEditor({ title, mark, choosing, onChange, onChoose }: { title: string; mark: AvailabilityMark | null; choosing: boolean; onChange: (mark: AvailabilityMark | null) => void; onChoose: () => void }) {
  const status: AvailabilityStatus | null = choosing ? 'yes' : mark?.status ?? null;
  const parts = !choosing && mark?.status === 'yes' ? mark.parts : [];
  const whole = parts.length === DAY_PARTS.length;
  const setParts = (next: DayPart[]) => next.length ? onChange(normalizeMark({ status: 'yes', parts: next })) : onChoose();
  const pick = (next: AvailabilityStatus | null) => {
    if (next === status) return;
    if (next === 'yes') onChoose();
    else onChange(next && { status: next, parts: [] });
  };
  return <section className="availability-editor" aria-label={title}>
    <h4>{title}</h4>
    <div className="chips" role="group" aria-label="Смогу ли играть">
      <button type="button" className={`chip-btn${status === null ? ' on' : ''}`} aria-pressed={status === null} onClick={() => pick(null)}>Не указано</button>
      <button type="button" className={`chip-btn${status === 'yes' ? ' on' : ''}`} aria-pressed={status === 'yes'} onClick={() => pick('yes')}>Могу</button>
      <button type="button" className={`chip-btn${status === 'no' ? ' on' : ''}`} aria-pressed={status === 'no'} onClick={() => pick('no')}>Не могу</button>
    </div>
    {status === 'yes' && <>
      <p className="muted">Во сколько можешь</p>
      <div className="chips availability-times" role="group" aria-label="Время">
        {DAY_PARTS.map(part => <button type="button" key={part} className={`chip-btn${parts.includes(part) ? ' on' : ''}`} aria-pressed={parts.includes(part)} onClick={() => setParts(parts.includes(part) ? parts.filter(p => p !== part) : [...parts, part])}>{DAY_PART_LABEL[part]}</button>)}
        <button type="button" className={`chip-btn availability-whole${whole ? ' on' : ''}`} aria-pressed={whole} onClick={() => setParts(whole ? [] : [...DAY_PARTS])}>Весь день</button>
      </div>
      <p className="muted" role="status">{choosing ? 'Выбери время, и отметка сохранится.' : ''}</p>
    </>}
  </section>;
}

/** Календарь доступности: нижний лист поверх профиля; каждая отметка сохраняется сразу. */
export function AvailabilitySheet({ onClose }: { onClose: () => void }) {
  const { data, error, reload, replace } = useResource<AvailabilityDto>('/api/availability');
  const toast = useToast();
  const [date, setDate] = useState<string | null>(null);
  /** День, где нажато «Могу», а время ещё не выбрано. */
  const [choosing, setChoosing] = useState<string | null>(null);
  const latest = useRef(0);

  /** Показываем выбор сразу; ответ сервера принимаем только от последнего сохранения. */
  async function saveDay(dto: AvailabilityDto, day: string, mark: AvailabilityMark | null) {
    const operation = ++latest.current;
    replace({ ...dto, days: dto.days.map(d => d.date === day ? { ...d, mark } : d), markedThisWeek: dto.markedThisWeek || mark !== null });
    haptic('light');
    try {
      const saved = await api.send<AvailabilityDto>('PUT', `/api/availability/days/${day}`, { mark });
      if (operation === latest.current) replace(saved);
    } catch {
      if (operation !== latest.current) return;
      toast('Не получилось сохранить. Попробуй ещё раз.', { tone: 'error' });
      reload();
    }
  }

  // Неделя показана целиком; прошедшие дни недоступны, по умолчанию выбран сегодняшний.
  const selectedDay = data?.days.find(d => d.date === date && !d.past) ?? data?.days.find(d => !d.past);
  return <ActionSheet title="Когда могу играть" description="Отметки сохраняются сразу" className="availability-sheet" onClose={onClose}>
    <p className="muted availability-intro">Отметь дни этой недели, с сегодняшнего по воскресенье. В дни, когда не можешь, бот не напишет о новом матче. Организатор видит, кто может, и выбирает день для игры. Пока день не отмечен, уведомления приходят как обычно.</p>
    {error && !data && <ErrorNote text="Не получилось загрузить календарь" retry={reload} />}
    {!data && !error && <Skeleton><div className="availability-editor"><p><Sk w="100%" /> <Sk w="100%" /> <Sk w="60%" /></p></div></Skeleton>}
    {data && selectedDay && <>
      <AvailabilityGrid label="Эта неделя" selected={selectedDay.date} onSelect={setDate} cells={data.days.map(d => ({
        key: d.date, top: WEEKDAY_SHORT[weekdayOf(d.date)], main: String(Number(d.date.slice(8))), tone: d.mark?.status ?? null, disabled: d.past,
        label: `${formatDateRu(d.date)} — ${d.past ? 'день прошёл' : availabilityLabel(d.mark).toLowerCase()}`,
      }))} />
      <MarkEditor title={capital(formatDateRu(selectedDay.date))} mark={selectedDay.mark} choosing={choosing === selectedDay.date && selectedDay.mark?.status !== 'yes'}
        onChange={mark => {
          // Выбранное время само снимает ожидание; кнопки времени при этом остаются на месте.
          if (mark?.status !== 'yes') setChoosing(null);
          void saveDay(data, selectedDay.date, mark);
        }}
        onChoose={() => {
          // Прежняя отметка снимается сразу: пока время не выбрано, день не отмечен.
          if (selectedDay.mark) void saveDay(data, selectedDay.date, null);
          setChoosing(selectedDay.date);
        }} />
    </>}
  </ActionSheet>;
}
