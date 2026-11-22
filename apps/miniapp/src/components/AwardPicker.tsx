import type { ReviewPlayerStats } from '@altynka/core';
import { Avatar } from './Icon';
import { reviewStatsLine } from './ReviewStats';

type Props = {
  label: string;
  players: { userId: number; name: string; photoUrl?: string | null; stats?: ReviewPlayerStats }[];
  /** The ratings this voter has just given; they help to remember who stood out. */
  scores: Record<number, number>;
  value: number | undefined;
  disabled: boolean;
  onChange: (userId: number) => void;
};

/** One prize, one choice: native radios keep arrow-key selection and a single tab stop. */
export function AwardPicker({ label, players, scores, value, disabled, onChange }: Props) {
  return <fieldset className="award-picker" role="radiogroup" aria-label={label} disabled={disabled}>
    {players.map(person => <label key={person.userId} className="award-option" data-on={value === person.userId || undefined}>
      <input type="radio" name="award-pick" checked={value === person.userId} onChange={() => onChange(person.userId)} />
      <Avatar name={person.name} photoUrl={person.photoUrl} />
      <span className="award-option-name">{person.name}{person.stats && <small className="award-option-stats">{reviewStatsLine(person.stats)}</small>}</span>
      <span className="award-option-score">{scores[person.userId] === undefined ? '—' : `твоя оценка ${scores[person.userId]}`}</span>
    </label>)}
  </fieldset>;
}
