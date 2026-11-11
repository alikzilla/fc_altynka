import { Icon } from './Icon';

export interface AvailabilityCell {
  key: string;
  /** Короткая подпись сверху: день недели. */
  top: string;
  /** Число месяца; у дней недели его нет. */
  main?: string;
  tone: 'yes' | 'no' | null;
  /** Сколько человек может: сводка организатора. */
  count?: number;
  /** Полное название для экранного диктора: «среда, 11 ноября — могу». */
  label: string;
}

/** Семь колонок без горизонтальной прокрутки: не спорит с жестами листа и возврата. */
export function AvailabilityGrid({ cells, selected, onSelect, label }: { cells: AvailabilityCell[]; selected: string | null; onSelect: (key: string) => void; label: string }) {
  return <div className="availability-grid" role="group" aria-label={label}>
    {cells.map(cell => <button type="button" key={cell.key} className={`availability-cell${cell.tone ? ` ${cell.tone}` : ''}${cell.key === selected ? ' selected' : ''}`}
      aria-pressed={cell.key === selected} aria-label={cell.label} onClick={() => onSelect(cell.key)}>
      <span className="availability-cell-top">{cell.top}</span>
      {cell.main && <b>{cell.main}</b>}
      {cell.count !== undefined
        ? <span className={`availability-cell-count${cell.count ? '' : ' none'}`}>{cell.count || ''}</span>
        : <span className="availability-cell-mark">{cell.tone && <Icon name={cell.tone === 'yes' ? 'check' : 'close'} />}</span>}
    </button>)}
  </div>;
}
