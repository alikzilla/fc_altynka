import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { SheetPlaceholder } from './SheetPlaceholder';

/*
 * Поле «Место проведения» в шторке назначения. Его рисует и каркас шторки, поэтому оно в отдельном файле:
 * каркас входит в основной бандл, шторка назначения и выбор площадки — нет.
 */

/** Название площадки со строкой адреса. Невидимая копия держит место под адрес: выбор площадки не растит поле. */
export function VenueTriggerText({ id, children }: { id?: string; children: ReactNode }) {
  return <span className="sheet-stack venue-trigger-text"><span id={id}>{children}</span><span className="sheet-stack-hidden" aria-hidden="true" inert>{'\u00a0'}<small>{'\u00a0'}</small></span></span>;
}

/**
 * Заглушка сводки площадки (ссылка на карту и цена), пока площадка не выбрана. С местом, которого нет среди
 * сохранённых площадок (`hinted={false}`), подсказка противоречила бы полю: место остаётся пустым.
 */
export function VenueSummaryPlaceholder({ hinted = true }: { hinted?: boolean }) {
  return <SheetPlaceholder className="venue-summary-placeholder" hint={hinted ? 'Выбери площадку — появится карта' : undefined}>
    <div className="venue-summary"><span className="venue-map-link">Открыть в 2ГИС <Icon name="arrow" /></span><span className="venue-rate">Цена уточняется</span></div>
  </SheetPlaceholder>;
}
