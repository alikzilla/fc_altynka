import {
  DAY_PARTS, DAY_PART_LABEL, WEEKDAY_SHORT, availabilityLabel, formatDateRu, normalizeMark, weekdayOf,
  type AvailabilityDto, type AvailabilityMark, type AvailabilityStatus, type DayPart,
} from '@altynka/core';
import { useRef, useState } from 'react';
import { ActionSheet } from '../components/ActionSheet';
import { SheetPlaceholder } from '../components/SheetPlaceholder';
import { AvailabilityGrid } from '../components/AvailabilityGrid';
import { ErrorNote, Skeleton, Sk, useToast } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { useRevealAfter } from '../hooks/useRevealAfter';
import { api } from '../lib/api';
import { haptic } from '../lib/tg';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const TIME_STATUS = 'Выбери время, и отметка сохранится.';

/** Подпись и кнопки времени; `skeleton` — те же размеры без данных. */
function TimeButtons({ parts, whole, onSet, skeleton = false }: { parts: DayPart[]; whole: boolean; onSet?: (next: DayPart[]) => void; skeleton?: boolean }) {
  const skip = skeleton ? ' sk-fill' : '';
  return <>
    <p className="muted">Во сколько можешь</p>
    <div className="chips availability-times" role="group" aria-label="Время">
      {DAY_PARTS.map(part => <button type="button" key={part} className={`chip-btn${parts.includes(part) ? ' on' : ''}${skip}`} aria-pressed={parts.includes(part)} onClick={() => onSet?.(parts.includes(part) ? parts.filter(p => p !== part) : [...parts, part])}>{DAY_PART_LABEL[part]}</button>)}
      <button type="button" className={`chip-btn availability-whole${whole ? ' on' : ''}${skip}`} aria-pressed={whole} onClick={() => onSet?.(whole ? [] : [...DAY_PARTS])}>Весь день</button>
    </div>
  </>;
}

/** Живая область есть всегда, ещё без текста; высоту строки держит невидимый образец, текст не сдвигает шторку. */
function StatusLine({ text }: { text: string }) {
  return <p className="muted availability-status" role="status" data-sizer={TIME_STATUS}><span>{text}</span></p>;
}

/** Каркас шторки: тот же календарь и редактор с областью выбора времени, только без данных. */
function AvailabilitySkeleton() {
  return <Skeleton>
    <div className="availability-grid">{Array.from({ length: 7 }, (_, i) => <div key={i} className="availability-cell sk-fill" />)}</div>
    <div className="availability-editor">
      <h4><Sk w="55%" /></h4>
      <div className="chips">{[0, 1, 2].map(i => <span key={i} className="chip-btn sk-fill">Не указано</span>)}</div>
      <div className="availability-time-section"><TimeButtons parts={[]} whole={false} skeleton /></div>
      <p className="muted availability-status" data-sizer={TIME_STATUS} />
    </div>
  </Skeleton>;
}

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
  // Одна и та же разметка стоит и настоящей, и невидимым образцом размера внутри заглушки.
  const timeSection = <TimeButtons parts={parts} whole={whole} onSet={setParts} />;
  // Выбор времени проявляется на месте заглушки; пока «Могу» горит, класс остаётся.
  const fade = useRevealAfter(status === 'yes');
  return <section className="availability-editor" aria-label={title}>
    <h4>{title}</h4>
    <div className="chips" role="group" aria-label="Смогу ли играть">
      <button type="button" className={`chip-btn${status === null ? ' on' : ''}`} aria-pressed={status === null} onClick={() => pick(null)}>Не указано</button>
      <button type="button" className={`chip-btn${status === 'yes' ? ' on' : ''}`} aria-pressed={status === 'yes'} onClick={() => pick('yes')}>Могу</button>
      <button type="button" className={`chip-btn${status === 'no' ? ' on' : ''}`} aria-pressed={status === 'no'} onClick={() => pick('no')}>Не могу</button>
    </div>
    {status === 'yes'
      ? <div className={`availability-time-section ${fade ?? ''}`.trim()}>{timeSection}</div>
      : <SheetPlaceholder hint="Выбери «Могу» — здесь появится выбор времени"><div className="availability-time-section">{timeSection}</div></SheetPlaceholder>}
    <StatusLine text={choosing ? 'Выбери время, и отметка сохранится.' : ''} />
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
    {!data && !error && <AvailabilitySkeleton />}
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
