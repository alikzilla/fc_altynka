import { TEAM_COLORS, teamAppearance, type TeamColor } from '@altynka/core';
import { ActionSheet } from './ActionSheet';
import { TeamShirt } from './TeamShirt';

const OWNER: Record<TeamColor, string> = { red: 'Красных', blue: 'Синих', yellow: 'Жёлтых', green: 'Зелёных', white: 'Белых', black: 'Чёрных' };

type Props = { index: number; colors: TeamColor[]; busy?: boolean; error?: string | null; onPick: (colors: TeamColor[]) => void; onClose: () => void };

/** Picks the kit of one team. An occupied colour swaps with the team wearing it; players never move. */
export function nextColors(colors: readonly TeamColor[], index: number, key: TeamColor): TeamColor[] {
  const next = [...colors];
  const other = next.indexOf(key);
  if (other >= 0) next[other] = next[index];
  next[index] = key;
  return next;
}

export function TeamColorSheet({ index, colors, busy, error, onPick, onClose }: Props) {
  const current = teamAppearance(index, colors);
  return <ActionSheet title={`Форма: ${current.name}`} onClose={onClose} busy={busy} className="team-color-sheet">
    <p className="muted">Выбери цвет манишек или формы на поле. Если цвет уже занят, команды поменяются цветами — игроки останутся на местах.</p>
    <div className="team-color-options">{TEAM_COLORS.map(color => {
      const owner = colors.indexOf(color.key);
      const note = owner === index ? 'сейчас' : owner >= 0 ? `у ${OWNER[color.key]}` : '';
      return <button key={color.key} type="button" className={`team-color-option team-${color.key}`} aria-label={note ? `${color.label}, ${note}` : color.label} aria-pressed={owner === index} disabled={busy}
        onClick={() => { if (owner === index) onClose(); else onPick(nextColors(colors, index, color.key)); }}>
        <TeamShirt /><span>{color.label}</span><small>{note}</small>
      </button>;
    })}</div>
    {error && <p className="field-error" role="alert">{error}</p>}
  </ActionSheet>;
}
