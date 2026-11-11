import { useEffect, useRef } from 'react';
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

/**
 * Семь колонок. `slider` — лента длиннее недели: видно семь дней и край восьмого, остальные листаются
 * пальцем; выбранный день сам прокручивается в поле зрения.
 */
export function AvailabilityGrid({ cells, selected, onSelect, label, slider = false }: { cells: AvailabilityCell[]; selected: string | null; onSelect: (key: string) => void; label: string; slider?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (slider) root.current?.querySelector<HTMLElement>('.selected')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [slider, selected]);
  return <div ref={root} className={`availability-grid${slider ? ' availability-strip' : ''}`} role="group" aria-label={label}>
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
