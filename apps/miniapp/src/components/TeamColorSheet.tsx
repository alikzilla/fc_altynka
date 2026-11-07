import { TEAM_COLORS, teamAppearance, plural, type TeamColor } from '@altynka/core';
import { useState } from 'react';
import { ActionSheet } from './ActionSheet';

type Props = { colors: TeamColor[]; players: string[][]; busy?: boolean; error?: string | null; onApply: (colors: TeamColor[]) => void; onClose: () => void };

export function TeamColorSheet({ colors, players, busy, error, onApply, onClose }: Props) {
  const [draft, setDraft] = useState([...colors]);
  const [note, setNote] = useState('Если выбрать занятый цвет, команды обменяются цветами. Игроки останутся вместе.');
  function choose(index: number, key: TeamColor) {
    if (busy || draft[index] === key) return;
    const next = [...draft];
    const other = next.indexOf(key);
    if (other >= 0) {
      [next[index], next[other]] = [next[other], next[index]];
      setNote(`${teamAppearance(index, colors).name} и ${teamAppearance(other, colors).name} обменяются цветами. Составы останутся прежними.`);
    } else { next[index] = key; setNote('Цвет изменится у всей команды. Игроки останутся вместе.'); }
    setDraft(next);
  }
  return <ActionSheet title="Форма и манишки" onClose={onClose} busy={busy} className="team-color-sheet" footer={<button className="btn primary wide" disabled={busy} onClick={() => onApply(draft)}>{busy ? 'Сохраняем…' : 'Применить цвета'}</button>}>
    <p className="muted">Выбери цвета, в которых команды действительно будут играть.</p>
    {colors.map((_, index) => <section className="team-color-section" key={index}>
      <h3>{teamAppearance(index, colors).name}{players[index]?.length ? ` · ${players[index].length} ${plural(players[index].length, 'игрок', 'игрока', 'игроков')}` : ''}</h3>
      {!!players[index]?.length && <p className="muted">{players[index].slice(0, 2).join(', ')}{players[index].length > 2 ? ` и ещё ${players[index].length - 2}` : ''}</p>}
      <div className="team-color-options">{TEAM_COLORS.map(color => <button key={color.key} type="button" className={`team-color-option team-${color.key}`} aria-label={`${color.label} цвет для команды ${index + 1}`} aria-pressed={draft[index] === color.key} disabled={busy} onClick={() => choose(index, color.key)}><span className="team-dot" aria-hidden="true" />{color.label}</button>)}</div>
    </section>)}
    <p className="team-color-note" role="status">{note}</p>
    {error && <p className="field-error" role="alert">{error}</p>}
  </ActionSheet>;
}
