import { teamAppearance, teamColorsFor, type EventDetailDto, type GameProtocolDto, type TeamColor } from '@altynka/core';
import { useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { ActionSheet } from '../components/ActionSheet';
import { TeamColorSheet } from '../components/TeamColorSheet';
import { TossCoin } from '../components/TossCoin';
import { api, ApiError } from '../lib/api';
import { haptic } from '../lib/tg';

type Props = { ev: EventDetailDto; reload: () => void; onClose: () => void };

/**
 * «Начинаем матч»: check the kits on the pitch, then toss. The toss itself starts the match; the server
 * decides the resting (3 teams) or kickoff (2 teams) team once and the coin only reveals it.
 * Mounted above the editor so the refetch after the start cannot unmount it mid-flight.
 */
export function StartMatchSheet({ ev, reload, onClose }: Props) {
  const [, navigate] = useLocation();
  // The sheet keeps the lineup it opened with; the event switches to «playing» under it.
  const [snapshot] = useState(() => ({ count: ev.teams?.teamCount ?? 2, sizes: ev.teams?.teams.map(ids => ids.length) ?? [] }));
  const [colors, setColors] = useState<TeamColor[]>(() => teamColorsFor(snapshot.count, ev.teams?.colors));
  const [revision, setRevision] = useState(ev.teams?.colorsRevision ?? 0);
  const [colorTeam, setColorTeam] = useState<number | null>(null);
  const [colorBusy, setColorBusy] = useState(false);
  const [colorError, setColorError] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<GameProtocolDto | null>(null);
  const [flying, setFlying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ requestId: string; expectedRevision: number } | null>(null);
  const three = snapshot.count === 3;
  const faces = colors.map((_, index) => ({ key: teamAppearance(index, colors).key, name: teamAppearance(index, colors).name }));
  const answer = !protocol ? null : three ? protocol.restingTeamIndex : protocol.kickoffTeamIndex ?? 0;
  const pair = protocol?.currentPair ?? null;

  async function pickColors(next: TeamColor[]) {
    setColorBusy(true); setColorError(null);
    try {
      await api.send('PATCH', `/api/events/${ev.id}/teams/colors`, { colors: next, expectedRevision: revision });
      setColors(next); setRevision(revision + 1); setColorTeam(null); haptic('success'); reload();
    } catch (failure) {
      setColorError(failure instanceof ApiError && failure.status === 409 ? 'Цвета изменились. Закрой шторку, проверь обновлённые цвета и попробуй ещё раз.' : 'Не получилось сохранить цвета. Попробуй ещё раз.');
      if (failure instanceof ApiError && failure.status === 409) reload();
    } finally { setColorBusy(false); }
  }

  async function start() {
    setFlying(true); setFailed(false); setError(null);
    request.current ??= { requestId: crypto.randomUUID(), expectedRevision: ev.gameProtocol?.revision ?? 0 };
    try {
      const reply = await api.send<{ protocol: GameProtocolDto }>('POST', `/api/events/${ev.id}/games/start`, request.current);
      setProtocol(reply?.protocol ?? null);
      if (!reply?.protocol) setFailed(true);
    } catch (failure) {
      const conflict = failure instanceof ApiError && failure.status === 409;
      setError(conflict ? 'Составы изменились. Обнови и подтверди их перед стартом.' : 'Не получилось начать матч. Попробуй ещё раз.');
      setFailed(true);
      if (conflict) { request.current = null; reload(); }
    } finally { setFlying(false); }
  }

  function close() {
    onClose();
    if (protocol) reload();
  }
  function toGames() {
    onClose(); reload(); navigate(`/event/${ev.id}?tab=games`);
  }

  const decided = protocol !== null && answer !== null;
  const landed = decided && revealed;
  return <>
    <ActionSheet title="Начинаем матч" onClose={close} busy={flying || decided && !revealed} className="start-sheet">
      <section className="start-step">
        <span className="start-step-number" aria-hidden="true">1</span>
        <div><h3>Сверь цвета на поле</h3><p>Манишки должны совпадать с командами в приложении. Нажми на команду, чтобы поменять цвет.</p>
          <div className="start-kits">{faces.map((face, index) => <button type="button" key={index} className={`start-kit team-${face.key}`} disabled={flying || decided} aria-label={`Изменить цвет: ${face.name}`} onClick={() => { setColorError(null); setColorTeam(index); }}>
            <span className="team-dot" aria-hidden="true" />{face.name}<small>{snapshot.sizes[index] ?? 0}</small>
          </button>)}</div>
        </div>
      </section>
      <section className="start-step">
        <span className="start-step-number" aria-hidden="true">2</span>
        <div><h3>{three ? 'Кто отдыхает первым?' : 'Кто начинает с мячом?'}</h3>
          <p>{three ? 'Монета выберет команду, которая пропускает первую игру.' : 'Монета выберет команду, которая первой разыгрывает мяч с центра.'} Подбрось монету — матч начнётся, составы зафиксируются.</p></div>
      </section>
      <TossCoin faces={faces} result={decided ? answer : null} failed={failed} disabled={decided} onToss={start} onLanded={() => setRevealed(true)} />
      {error && <p className="field-error" role="alert">{error}</p>}
      {landed && <div className="start-answer" role="status">
        <p className={`start-answer-line team-${faces[answer]?.key}`}><span className="team-dot" aria-hidden="true" />{three ? `Отдыхают ${faces[answer]?.name}` : `С мячом начинают ${faces[answer]?.name}`}</p>
        {pair && <p className="start-pair material-blue"><span className={`game-team-name team-${faces[pair[0]]?.key}`}><span className="team-dot" aria-hidden="true" />{faces[pair[0]]?.name}</span><small>ИГРА 1</small><span className={`game-team-name team-${faces[pair[1]]?.key}`}>{faces[pair[1]]?.name}<span className="team-dot" aria-hidden="true" /></span></p>}
        <button type="button" className="btn primary wide" onClick={toGames}>К игре 1</button>
        <p className="start-saved">Результат сохранён и виден всем участникам</p>
      </div>}
    </ActionSheet>
    {colorTeam !== null && <TeamColorSheet index={colorTeam} colors={colors} busy={colorBusy} error={colorError} onClose={() => setColorTeam(null)} onPick={pickColors} />}
  </>;
}
