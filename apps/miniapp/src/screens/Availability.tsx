import {
  DAY_PARTS, DAY_PART_LABEL, WEEKDAY_LONG, WEEKDAY_SHORT, availabilityLabel, formatDateRu, normalizeMark, weekdayOf,
  type AvailabilityDto, type AvailabilityMark, type AvailabilityStatus, type DayPart,
} from '@altynka/core';
import { useRef, useState } from 'react';
import { AvailabilityGrid } from '../components/AvailabilityGrid';
import { ActionSheet } from '../components/ActionSheet';
import { ErrorNote, Skeleton, Sk, useToast } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { api } from '../lib/api';
import { haptic } from '../lib/tg';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Три состояния дня и, для «могу», части дня. `unset` — подпись пустого состояния. */
function MarkEditor({ title, hint, mark, unset, onChange }: { title: string; hint?: string; mark: AvailabilityMark | null; unset: string; onChange: (mark: AvailabilityMark | null) => void }) {
  const status = mark?.status ?? null;
  const pick = (next: AvailabilityStatus | null) => { if (next !== status) onChange(next && { status: next, parts: [] }); };
  const toggle = (part: DayPart) => onChange(normalizeMark({ status: 'yes', parts: mark!.parts.includes(part) ? mark!.parts.filter(p => p !== part) : [...mark!.parts, part] }));
  return <section className="availability-editor" aria-label={title}>
    <h4>{title}</h4>
    <div className="chips" role="group" aria-label="Смогу ли играть">
      <button type="button" className={`chip-btn${status === null ? ' on' : ''}`} aria-pressed={status === null} onClick={() => pick(null)}>{unset}</button>
      <button type="button" className={`chip-btn${status === 'yes' ? ' on' : ''}`} aria-pressed={status === 'yes'} onClick={() => pick('yes')}>Могу</button>
      <button type="button" className={`chip-btn${status === 'no' ? ' on' : ''}`} aria-pressed={status === 'no'} onClick={() => pick('no')}>Не могу</button>
    </div>
    {status === 'yes' && <>
      <p className="muted">Когда удобнее · необязательно</p>
      <div className="chips" role="group" aria-label="Удобное время">
        {DAY_PARTS.map(part => <button type="button" key={part} className={`chip-btn${mark!.parts.includes(part) ? ' on' : ''}`} aria-pressed={mark!.parts.includes(part)} onClick={() => toggle(part)}>{DAY_PART_LABEL[part]}</button>)}
      </div>
    </>}
    {hint && <p className="muted">{hint}</p>}
  </section>;
}

/** Календарь доступности: нижний лист поверх профиля; каждая отметка сохраняется сразу. */
export function AvailabilitySheet({ onClose }: { onClose: () => void }) {
  const { data, error, reload, replace } = useResource<AvailabilityDto>('/api/availability');
  const toast = useToast();
  const [date, setDate] = useState<string | null>(null);
  const [weekday, setWeekday] = useState<number | null>(null);
  const latest = useRef(0);

  /** Показываем выбор сразу; ответ сервера принимаем только от последнего сохранения. */
  async function save(next: AvailabilityDto, request: () => Promise<AvailabilityDto>) {
    const operation = ++latest.current;
    replace(next);
    haptic('light');
    try {
      const saved = await request();
      if (operation === latest.current) replace(saved);
    } catch {
      if (operation !== latest.current) return;
      toast('Не получилось сохранить. Попробуй ещё раз.', { tone: 'error' });
      reload();
    }
  }

  function saveDay(dto: AvailabilityDto, day: string, mark: AvailabilityMark | null) {
    const days = dto.days.map(d => d.date === day ? { date: day, mark: mark ?? dto.weekly[weekdayOf(day)], override: !!mark } : d);
    void save({ ...dto, days }, () => api.send<AvailabilityDto>('PUT', `/api/availability/days/${day}`, { mark }));
  }

  function saveWeekday(dto: AvailabilityDto, index: number, mark: AvailabilityMark | null) {
    const weekly = dto.weekly.map((m, i) => i === index ? mark : m);
    const days = dto.days.map(d => d.override ? d : { ...d, mark: weekly[weekdayOf(d.date)] });
    void save({ weekly, days }, () => api.send<AvailabilityDto>('PUT', '/api/availability/weekly', { weekly }));
  }

  const selectedDay = data?.days.find(d => d.date === date) ?? data?.days[0];
  return <ActionSheet title="Когда могу играть" description="Отметки сохраняются сразу" className="availability-sheet" onClose={onClose}>
    <p className="muted availability-intro">Отметь дни, когда не можешь, и бот не напишет о новом матче в эти дни. Организатор видит, кто может, и выбирает день для игры. Пока день не отмечен, уведомления приходят как обычно.</p>
    {error && !data && <ErrorNote text="Не получилось загрузить календарь" retry={reload} />}
    {!data && !error && <Skeleton><div className="availability-editor"><p><Sk w="100%" /> <Sk w="100%" /> <Sk w="60%" /></p></div></Skeleton>}
    {data && selectedDay && <>
      <h3 className="section">Ближайшие две недели</h3>
      <AvailabilityGrid label="Ближайшие две недели" selected={selectedDay.date} onSelect={setDate} cells={data.days.map(d => ({
        key: d.date, top: WEEKDAY_SHORT[weekdayOf(d.date)], main: String(Number(d.date.slice(8))), tone: d.mark?.status ?? null,
        label: `${formatDateRu(d.date)} — ${availabilityLabel(d.mark).toLowerCase()}`,
      }))} />
      <MarkEditor title={capital(formatDateRu(selectedDay.date))} unset="Как обычно" mark={selectedDay.override ? selectedDay.mark : null}
        hint={selectedDay.override ? undefined : `По обычному графику: ${availabilityLabel(selectedDay.mark).toLowerCase()}`}
        onChange={mark => saveDay(data, selectedDay.date, mark)} />
      <h3 className="section">Обычный график</h3>
      <p className="muted">Повторяется каждую неделю. Отметка на конкретный день важнее.</p>
      <AvailabilityGrid label="Обычный график" selected={weekday === null ? null : String(weekday)} onSelect={key => setWeekday(Number(key))} cells={data.weekly.map((mark, i) => ({
        key: String(i), top: WEEKDAY_SHORT[i], tone: mark?.status ?? null, label: `${WEEKDAY_LONG[i]} — ${availabilityLabel(mark).toLowerCase()}`,
      }))} />
      {weekday !== null && <MarkEditor title={WEEKDAY_LONG[weekday]} unset="Не указано" mark={data.weekly[weekday]} onChange={mark => saveWeekday(data, weekday, mark)} />}
    </>}
  </ActionSheet>;
}
