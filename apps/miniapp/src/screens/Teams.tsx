import { formatRating, alternativeSplit, balanceTeams, teamCountFor, TEAMS, type EventDetailDto, type SignupDto, type TeamCount } from '@altynka/core';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { api, ApiError } from '../lib/api';
import { isOpen } from '../lib/labels';
import { canManage, useMe } from '../state/me';
import { haptic } from '../lib/tg';
import { EmptyState, useToast } from '../components/ui';
import { MatchAction } from '../components/MatchAction';
import { PlayerProfileSheet } from './PlayerProfile';

type Props = { ev: EventDetailDto; reload: () => void; actionBlocked?: boolean };

function TeamBlock(p: { index: number; ids: number[]; byId: Map<number, SignupDto>; children?: (s: SignupDto) => React.ReactNode; sum?: number; onHeader?: () => void }) {
  const t = TEAMS[p.index];
  return (
    <section className={`card team team-${t.key}`} role="group" aria-label={t.name}>
      {p.onHeader ? <button type="button" className="team-heading" onClick={p.onHeader} aria-label={`Перенести выбранного игрока: ${t.name}`}><b><span className="team-dot" />{t.name}</b>{p.sum !== undefined && <span className="muted">Сумма {formatRating(p.sum)}</span>}</button> : <div className="team-heading"><b><span className="team-dot" />{t.name}</b></div>}
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
  const me = useMe();
  const [profileId, setProfileId] = useState<number | null>(null);
  const byId = new Map(ev.main.map(s => [s.id, s]));
  const ownSignup = ev.main.find(s => s.userId === me.userId);
  const ownTeam = ownSignup ? ev.teams?.teams.findIndex(ids => ids.includes(ownSignup.id)) : -1;
  if (!ev.teams?.publishedAt) return <EmptyState title="Составы ещё не опубликованы" text="Организатор добавит команды перед игрой." />;
  return (
    <>
      {ownTeam !== undefined && ownTeam >= 0 && <p className="team-own">Твоя команда — {TEAMS[ownTeam].name.toLocaleLowerCase('ru')}</p>}
      {ev.teams.stale && <p className="card warn-note">Участники изменились. Организатор обновит составы перед игрой.</p>}
      {profileId !== null && <PlayerProfileSheet userId={profileId} onClose={() => setProfileId(null)} />}
      {ev.teams.teams.map((ids, i) => (
        <TeamBlock key={i} index={i} ids={ids} byId={byId}>{s => <span className={s.userId === me.userId ? 'team-self' : ''}>{s.userId !== null ? <button className="btn-plain player-profile-link" onClick={() => setProfileId(s.userId)}>{s.name}</button> : s.name}{s.userId === me.userId && <span className="you">ты</span>}</span>}</TeamBlock>
      ))}
    </>
  );
}

function TeamEditor({ ev, reload, actionBlocked }: Props) {
  const toast = useToast();
  const byId = useMemo(() => new Map(ev.main.map(s => [s.id, s])), [ev.main]);
  const [count, setCount] = useState<TeamCount>(ev.teams?.teamCount ?? teamCountFor(ev.main.length));
  const [split, setSplit] = useState<number[][]>(() => (ev.teams && !ev.teams.stale ? ev.teams.teams : []));
  const [freshSplit, setFreshSplit] = useState(false);
  const [guestLevels, setGuestLevels] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const currentLevelOf = (s: SignupDto) => (s.userId === null ? (guestLevels[s.id] ?? s.level ?? 5) : (s.level ?? 5));
  const levelOf = (s: SignupDto) => freshSplit || s.userId === null ? currentLevelOf(s) : ev.teams?.ratingSnapshot?.[s.id] ?? currentLevelOf(s);
  const rated = ev.main.map(s => ({ id: s.id, level: currentLevelOf(s) }));
  const sumOf = (ids: number[]) => ids.reduce((a, id) => a + Math.round((byId.get(id) ? levelOf(byId.get(id)!) : 0) * 10), 0) / 10;
  const teamOf = (id: number) => split.findIndex(t => t.includes(id));

  const divide = (n: TeamCount = count) => {
    setFreshSplit(true);
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
    if (busy) return;
    setBusy(true);
    try {
      const levels = Object.fromEntries(ev.main.filter(s => s.userId === null).map(s => [s.id, levelOf(s)]));
      const ratingSnapshot = Object.fromEntries(ev.main.map(s => [s.id, levelOf(s)]));
      await api.send('PUT', `/api/events/${ev.id}/teams`, { teamCount: count, teams: split, guestLevels: levels, refreshRatings: freshSplit || !ev.teams?.ratingSnapshot || ev.teams.stale, ratingSnapshot });
      await api.send('POST', `/api/events/${ev.id}/teams/publish`);
      haptic('success');
      toast('Составы отправлены в группу');
      setFreshSplit(false);
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError && err.status === 409) {
        toast('Состав или рейтинги изменились. Обнови и пересобери команды.');
        setSplit([]);
      } else toast('Не получилось сохранить составы');
    }
    setBusy(false);
    reload();
  }

  if (!ev.main.length) return <EmptyState title="Нет игроков для составов" text="Сначала запиши участников на матч." action={<Link href={`/event/${ev.id}`} className="btn">К списку участников</Link>} />;

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
        {split.length > 0 || actionBlocked ? <button className="btn wide" onClick={() => divide()} disabled={busy}>Поделить</button> : <MatchAction><button className="btn primary wide" onClick={() => divide()} disabled={busy}>Поделить</button></MatchAction>}
        <button className="btn wide" disabled={!split.length} onClick={() => { setFreshSplit(true); setSplit(alternativeSplit(rated, count, split)); }}>
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
                <span className="level">{formatRating(levelOf(s))}</span>
              )}
            </div>
          )}
        </TeamBlock>
      ))}
      {split.length > 0 && (
        actionBlocked ? <button className="btn wide" disabled={busy} onClick={publish}>Опубликовать составы</button> : <MatchAction><button className="btn primary wide" disabled={busy} onClick={publish}>Опубликовать составы</button></MatchAction>
      )}
    </>
  );
}

export function Teams(p: Props) {
  const me = useMe();
  return canManage(me) && isOpen(p.ev.status) ? <TeamEditor key={p.ev.main.map(s => s.id).join(',')} {...p} /> : <PublishedTeams {...p} />;
}
