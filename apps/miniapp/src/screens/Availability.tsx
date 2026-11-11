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

/** Три состояния дня и, для «могу», окна времени. */
function MarkEditor({ title, mark, onChange }: { title: string; mark: AvailabilityMark | null; onChange: (mark: AvailabilityMark | null) => void }) {
  const status = mark?.status ?? null;
  const pick = (next: AvailabilityStatus | null) => { if (next !== status) onChange(next && { status: next, parts: [] }); };
  const toggle = (part: DayPart) => onChange(normalizeMark({ status: 'yes', parts: mark!.parts.includes(part) ? mark!.parts.filter(p => p !== part) : [...mark!.parts, part] }));
  return <section className="availability-editor" aria-label={title}>
    <h4>{title}</h4>
    <div className="chips" role="group" aria-label="Смогу ли играть">
      <button type="button" className={`chip-btn${status === null ? ' on' : ''}`} aria-pressed={status === null} onClick={() => pick(null)}>Не указано</button>
      <button type="button" className={`chip-btn${status === 'yes' ? ' on' : ''}`} aria-pressed={status === 'yes'} onClick={() => pick('yes')}>Могу</button>
      <button type="button" className={`chip-btn${status === 'no' ? ' on' : ''}`} aria-pressed={status === 'no'} onClick={() => pick('no')}>Не могу</button>
    </div>
    {status === 'yes' && <>
      <p className="muted">Во сколько удобно · необязательно</p>
      <div className="chips availability-times" role="group" aria-label="Удобное время">
        {DAY_PARTS.map(part => <button type="button" key={part} className={`chip-btn${mark!.parts.includes(part) ? ' on' : ''}`} aria-pressed={mark!.parts.includes(part)} onClick={() => toggle(part)}>{DAY_PART_LABEL[part]}</button>)}
      </div>
    </>}
  </section>;
}

/** Календарь доступности: нижний лист поверх профиля; каждая отметка сохраняется сразу. */
export function AvailabilitySheet({ onClose }: { onClose: () => void }) {
  const { data, error, reload, replace } = useResource<AvailabilityDto>('/api/availability');
  const toast = useToast();
  const [date, setDate] = useState<string | null>(null);
  const latest = useRef(0);

  /** Показываем выбор сразу; ответ сервера принимаем только от последнего сохранения. */
  async function saveDay(dto: AvailabilityDto, day: string, mark: AvailabilityMark | null) {
    const operation = ++latest.current;
    replace({ days: dto.days.map(d => d.date === day ? { date: day, mark } : d) });
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

  const selectedDay = data?.days.find(d => d.date === date) ?? data?.days[0];
  return <ActionSheet title="Когда могу играть" description="Отметки сохраняются сразу" className="availability-sheet" onClose={onClose}>
    <p className="muted availability-intro">Отметь дни на ближайшую неделю. В дни, когда не можешь, бот не напишет о новом матче. Организатор видит, кто может, и выбирает день для игры. Пока день не отмечен, уведомления приходят как обычно.</p>
    {error && !data && <ErrorNote text="Не получилось загрузить календарь" retry={reload} />}
    {!data && !error && <Skeleton><div className="availability-editor"><p><Sk w="100%" /> <Sk w="100%" /> <Sk w="60%" /></p></div></Skeleton>}
    {data && selectedDay && <>
      <AvailabilityGrid label="Ближайшие 7 дней" selected={selectedDay.date} onSelect={setDate} cells={data.days.map(d => ({
        key: d.date, top: WEEKDAY_SHORT[weekdayOf(d.date)], main: String(Number(d.date.slice(8))), tone: d.mark?.status ?? null,
        label: `${formatDateRu(d.date)} — ${availabilityLabel(d.mark).toLowerCase()}`,
      }))} />
      <MarkEditor title={capital(formatDateRu(selectedDay.date))} mark={selectedDay.mark} onChange={mark => void saveDay(data, selectedDay.date, mark)} />
    </>}
  </ActionSheet>;
}
