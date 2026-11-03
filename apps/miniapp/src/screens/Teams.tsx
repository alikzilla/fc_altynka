import { alternativeSplit, balanceTeams, teamCountFor, TEAMS, type EventDetailDto, type SignupDto, type TeamCount } from '@altynka/core';
import { useMemo, useState } from 'react';
import { api } from '../api';
import { isOpen } from '../labels';
import { canManage, useMe } from '../me';
import { haptic } from '../tg';
import { useToast } from '../ui';

type Props = { ev: EventDetailDto; reload: () => void };

function TeamBlock(p: { index: number; ids: number[]; byId: Map<number, SignupDto>; children?: (s: SignupDto) => React.ReactNode; sum?: number; onHeader?: () => void }) {
  const t = TEAMS[p.index];
  return (
    <section className={`card team team-${t.key}`} role="group" aria-label={t.name}>
      <div className="row between" onClick={p.onHeader}>
        <b>
          {t.emoji} {t.name}
        </b>
        {p.sum !== undefined && <span className="muted">Сумма {p.sum}</span>}
      </div>
      <ul className="list bare">
        {p.ids.map(id => {
          const s = p.byId.get(id);
          return s ? <li key={id}>{p.children ? p.children(s) : s.name}</li> : null;
        })}
      </ul>
    </section>
  );
}

function PublishedTeams({ ev }: Props) {
  const byId = new Map(ev.main.map(s => [s.id, s]));
  if (!ev.teams?.publishedAt) return <div className="card muted center">Составы ещё не опубликованы</div>;
  return (
    <>
      {ev.teams.teams.map((ids, i) => (
        <TeamBlock key={i} index={i} ids={ids} byId={byId} />
      ))}
    </>
  );
}

function TeamEditor({ ev, reload }: Props) {
  const toast = useToast();
  const byId = useMemo(() => new Map(ev.main.map(s => [s.id, s])), [ev.main]);
  const [count, setCount] = useState<TeamCount>(ev.teams?.teamCount ?? teamCountFor(ev.main.length));
  const [split, setSplit] = useState<number[][]>(() => (ev.teams && !ev.teams.stale ? ev.teams.teams : []));
  const [guestLevels, setGuestLevels] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const levelOf = (s: SignupDto) => (s.userId === null ? (guestLevels[s.id] ?? s.level ?? 5) : (s.level ?? 5));
  const rated = ev.main.map(s => ({ id: s.id, level: levelOf(s) }));
  const sumOf = (ids: number[]) => ids.reduce((a, id) => a + (byId.get(id) ? levelOf(byId.get(id)!) : 0), 0);
  const teamOf = (id: number) => split.findIndex(t => t.includes(id));

  const divide = (n: TeamCount = count) => {
    setSplit(balanceTeams(rated, n));
    setSelected(null);
    haptic('light');
  };

  function tapPlayer(id: number) {
    if (selected === null || selected === id) return setSelected(selected === id ? null : id);
    const a = teamOf(selected);
    const b = teamOf(id);
    if (a === b) return setSelected(id);
    setSplit(split.map((t, i) => (i === a ? t.map(x => (x === selected ? id : x)) : i === b ? t.map(x => (x === id ? selected : x)) : t)));
    setSelected(null);
  }

  /** Перенос выделенного игрока в команду, если она меньше его текущей. */
  function tapTeam(target: number) {
    if (selected === null) return;
    const from = teamOf(selected);
    if (from === target || split[target].length >= split[from].length) return;
    setSplit(split.map((t, i) => (i === from ? t.filter(x => x !== selected) : i === target ? [...t, selected] : t)));
    setSelected(null);
  }

  async function publish() {
    setBusy(true);
    try {
      const levels = Object.fromEntries(ev.main.filter(s => s.userId === null).map(s => [s.id, levelOf(s)]));
      await api.send('PUT', `/api/events/${ev.id}/teams`, { teamCount: count, teams: split, guestLevels: levels });
      await api.send('POST', `/api/events/${ev.id}/teams/publish`);
      haptic('success');
      toast('Составы отправлены в группу');
    } catch {
      haptic('error');
      toast('Не получилось сохранить составы');
    }
    setBusy(false);
    reload();
  }

  if (!ev.main.length) return <div className="card muted center">В основе пока никого</div>;

  return (
    <>
      {ev.teams?.stale && <div className="card warn-note">Состав изменился — пересобери команды</div>}
      <div className="chips">
        {([2, 3] as const).map(n => (
          <button
            key={n}
            type="button"
            className={`chip-btn ${count === n ? 'on' : ''}`}
            aria-pressed={count === n}
            onClick={() => {
              setCount(n);
              setSplit([]);
            }}
          >
            {n} команды
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="btn primary wide" onClick={() => divide()}>
          Поделить
        </button>
        <button className="btn wide" disabled={!split.length} onClick={() => setSplit(alternativeSplit(rated, count, split))}>
          Ещё вариант
        </button>
      </div>
      {split.length > 0 && <p className="muted">Нажми на двух игроков из разных команд, чтобы поменять их местами.</p>}
      {split.map((ids, i) => (
        <TeamBlock key={i} index={i} ids={ids} byId={byId} sum={sumOf(ids)} onHeader={() => tapTeam(i)}>
          {s => (
            <div className={`row between pick ${selected === s.id ? 'selected' : ''}`}>
              <button type="button" className="btn-plain" aria-pressed={selected === s.id} onClick={() => tapPlayer(s.id)}>
                {s.name}
              </button>
              {s.userId === null ? (
                <select aria-label={`Уровень гостя ${s.name}`} value={levelOf(s)} onChange={e => setGuestLevels({ ...guestLevels, [s.id]: Number(e.target.value) })}>
                  {Array.from({ length: 10 }, (_, k) => (
                    <option key={k + 1} value={k + 1}>
                      {k + 1}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="level">{levelOf(s)}</span>
              )}
            </div>
          )}
        </TeamBlock>
      ))}
      {split.length > 0 && (
        <button className="btn primary wide" disabled={busy} onClick={publish}>
          Сохранить и опубликовать
        </button>
      )}
    </>
  );
}

export function Teams(p: Props) {
  const me = useMe();
  return canManage(me) && isOpen(p.ev.status) ? <TeamEditor {...p} /> : <PublishedTeams {...p} />;
}
