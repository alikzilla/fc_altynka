import { Avatar } from './Icon';

type Props = {
  label: string;
  players: { userId: number; name: string; photoUrl?: string | null }[];
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
      <span className="award-option-name">{person.name}</span>
      <span className="award-option-score">{scores[person.userId] === undefined ? '—' : `твоя оценка ${scores[person.userId]}`}</span>
    </label>)}
  </fieldset>;
}
