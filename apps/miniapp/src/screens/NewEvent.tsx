import { DAY_PARTS, DAY_PART_LABEL, WEEKDAY_SHORT, availabilityDates, formatDateRu, plural, todayAlmaty, weekdayOf, type AvailabilityPersonDto, type AvailabilitySummaryDto } from '@altynka/core';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { api, ApiError } from '../lib/api';
import { creatableCommunities, useMe } from '../state/me';
import { ConnectGroupButton, CONNECT_BOT_TEXT } from '../components/ConnectGroup';
import { useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { ActionSheet } from '../components/ActionSheet';
import { AvailabilityGrid } from '../components/AvailabilityGrid';
import { useResource } from '../hooks/useResource';

const names = (people: AvailabilityPersonDto[]) => people.map(p => p.name).join(', ');

/** Матч создаётся не дальше двух недель: лента — единственный выбор даты. Игроки отмечают только первую неделю. */
const PICKER_DAYS = 14;
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Дата матча: лента на две недели. Когда группа известна, под каждым днём — сколько человек может,
 * под лентой — строка с итогом по выбранному дню; полная статистика раскрывается по нажатию.
 * Без сводки (она не загрузилась или группа не выбрана) лента просто выбирает дату.
 */
function MatchDatePicker({ communityId, date, onPick }: { communityId: number | null; date: string; onPick: (date: string) => void }) {
  const { data } = useResource<AvailabilitySummaryDto>(communityId === null ? null : `/api/availability/summary?communityId=${communityId}`);
  const marked = new Map((data?.days ?? []).map(d => [d.date, d]));
  const day = marked.get(date);
  const total = day ? day.yes.length + day.no.length + day.unknown : 0;
  return <section className="availability-summary" aria-label="Дата матча">
    <p className="availability-date-heading"><span>Дата</span><b>{capital(formatDateRu(date))}</b></p>
    <AvailabilityGrid slider label="Дата" selected={date} onSelect={onPick} cells={availabilityDates(todayAlmaty(new Date()), PICKER_DAYS).map(d => {
      const known = marked.get(d);
      return {
        key: d, top: WEEKDAY_SHORT[weekdayOf(d)], main: String(Number(d.slice(8))), tone: null, count: known?.yes.length ?? 0,
        label: `${formatDateRu(d)}${!data?.days ? '' : !known ? ' — отметок пока нет' : known.yes.length ? ` — ${plural(known.yes.length, 'может', 'могут', 'могут')} ${known.yes.length}` : ' — никто не отметил, что может'}`,
      };
    })} />
    {day ? <details className="availability-details">
      <summary><span className="availability-details-title">Могут играть · <b>{day.yes.length}</b> из {total}</span><span className="availability-details-toggle">Кто может<Icon name="back" /></span></summary>
      <div className="availability-day">
        {day.yes.length > 0 && <ul className="availability-windows" aria-label="Кто может по времени">
          {DAY_PARTS.map(part => {
            const people = day.yes.filter(p => p.parts.includes(part));
            return <li key={part} className={people.length ? '' : 'none'}><span className="availability-window-time">{DAY_PART_LABEL[part]}</span><b>{people.length}</b><span className="availability-window-names">{people.length ? names(people) : 'никто'}</span></li>;
          })}
        </ul>}
        <p><b>Не могут · {day.no.length}</b>{day.no.length ? `: ${names(day.no)}` : ''}</p>
        <p className="muted">Не отметили · {day.unknown}. О новом матче бот напишет всем, кроме тех, кто не может.</p>
      </div>
    </details> : data?.days ? <p className="muted">На этот день отметок ещё нет: игроки отмечают неделю вперёд.</p> : null}
  </section>;
}

export function NewEvent({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const [, navigate] = useLocation();
  const toast = useToast();
  const locked = useRef(false);
  const live = useRef(true);
  const [date, setDate] = useState(() => todayAlmaty(new Date(Date.now() + 86_400_000)));
  const [comment, setComment] = useState('');
  const groups = creatableCommunities(me);
  const [picked, setPicked] = useState<number | null>(null);
  const communityId = groups.length === 1 ? groups[0].id : picked;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked.current || communityId === null) return;
    setError(null);
    if (!date || date < todayAlmaty(new Date())) { setError('Выбери сегодняшнюю или будущую дату'); return; }
    locked.current = true;
    setBusy(true);
    try {
      await api.send('POST', '/api/events', { date, communityId, comment: comment.trim() || undefined });
      if (!live.current) return;
      navigate('/matches', { replace: true });
      toast('Матч создан. Теперь можно собирать участников');
      requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus());
    } catch (err) {
      if (!live.current) return;
      setError(err instanceof ApiError && err.code === 'past_date' ? 'Выбери сегодняшнюю или будущую дату' : err instanceof ApiError && err.status === 403 ? 'Нет доступа к созданию матча в этой группе' : 'Не получилось создать матч. Проверь соединение и попробуй ещё раз.');
      locked.current = false;
      setBusy(false);
    }
  }
  return <ActionSheet title="Новый матч" description="День и группа для сбора" closeLabel="Закрыть создание матча" onClose={onClose} busy={busy}>
    {groups.length ? (
    <form className="form new-event-form" onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy} className="form-fields">
        {groups.length > 1 && <label>Группа
          <select required aria-describedby="group-hint" value={picked ?? ''} onChange={e => setPicked(e.target.value ? Number(e.target.value) : null)}>
            <option value="" disabled>Выбери группу</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>}
        {groups.length > 1 && <p id="group-hint" className="muted">Сообщение о сборе появится в выбранной группе.</p>}
        <MatchDatePicker communityId={communityId} date={date} onPick={setDate} />
        <label>Комментарий · необязательно<textarea maxLength={200} rows={3} placeholder="Например, берём светлые и тёмные футболки" value={comment} onChange={e => setComment(e.target.value)} /></label>
      </fieldset>
      <p className="muted">Игроки могут записываться сразу. Назначь время и длительность матча. Счёт станет доступен после его начала.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="btn primary wide" disabled={busy || communityId === null}>{busy ? 'Создаём матч…' : groups.length > 1 ? 'Открыть запись' : 'Создать матч'}<Icon name="plus" /></button>
    </form>
    ) : (
    <div className="empty-sheet">
      <p>{groups.length || me.communities.length ? 'Создавать матчи может организатор группы. Попроси администратора группы назначить тебя организатором.' : CONNECT_BOT_TEXT}</p>
      {me.communities.length > 0 && <p className="muted">Или подключи свою группу: добавь в неё бота администратором.</p>}
      <ConnectGroupButton />
    </div>
    )}
  </ActionSheet>;
}
