import { ACHIEVEMENT_TIER_LABEL, ACHIEVEMENT_TIER_TO, ACHIEVEMENT_TIERS, ACHIEVEMENT_TOTAL_LEVELS, isAchievementId, playerAchievements, plural, unlockedLevels,
  type AchievementId, type AchievementSymbol, type AchievementTier, type PlayerAchievement, type PlayerStatistics } from '@altynka/core';
import { useEffect, useState } from 'react';
import { ActionSheet } from './ActionSheet';
import { Icon } from './Icon';

/** Шестиугольная медаль уровня; декоративная, уровень всегда подписан текстом рядом. */
export function AchievementMedal({ tier, symbol, size }: { tier: AchievementTier | null; symbol: AchievementSymbol | null; size: 'lg' | 'md' | 'sm' }) {
  return <span className="achievement-medal" data-size={size} data-tier={tier ?? 'locked'} data-empty={symbol ? undefined : 'true'} aria-hidden="true">
    {symbol && size !== 'sm' && <Icon name={symbol}/>}
    {!symbol && <svg viewBox="0 0 100 100"><polygon points="50,3 92,27 92,73 50,97 8,73 8,27"/></svg>}
  </span>;
}

const amount = (row: PlayerAchievement, n = row.current) => `${n} ${plural(n, ...row.unit)}`;
const tierLine = (row: PlayerAchievement) => row.tier ? `${ACHIEVEMENT_TIER_LABEL[row.tier]} · ${amount(row)}` : 'Не открыто';
const progressText = (row: PlayerAchievement) => row.nextTarget === null ? String(row.current) : `${row.current} / ${row.nextTarget}`;

function Progress({ row }: { row: PlayerAchievement }) {
  const floor = row.level ? row.thresholds[row.level - 1] : 0;
  const max = row.nextTarget === null ? 1 : row.nextTarget - floor;
  const value = row.nextTarget === null ? 1 : Math.min(row.current, row.nextTarget) - floor;
  return <div className="achievement-progress">
    <progress max={max} value={value} aria-label={`Прогресс: ${row.title}`}/>
    {row.nextTier
      ? <p><span>{ACHIEVEMENT_TIER_TO[row.nextTier]}</span><span>{progressText(row)}</span></p>
      : <p><span>Максимальный уровень</span></p>}
  </div>;
}

function PinnedSlot({ row, editable, onOpen, onBrowse }: { row: PlayerAchievement | null; editable: boolean; onOpen: () => void; onBrowse: () => void }) {
  if (!row) {
    const body = <><AchievementMedal tier={null} symbol={null} size="lg"/><p className="achievement-empty-text">{editable ? 'Закрепи достижение, чтобы его видели другие' : 'Ничего не закреплено'}</p></>;
    return editable ? <button type="button" className="achievement-pinned" onClick={onBrowse}>{body}</button> : <div className="achievement-pinned">{body}</div>;
  }
  return <button type="button" className="achievement-pinned" onClick={onOpen}>
    <AchievementMedal tier={row.tier} symbol={row.symbol} size="lg"/>
    <span className="achievement-pinned-copy" data-tier={row.tier ?? 'locked'}>
      <small>Закреплено</small>
      <strong>{row.title}</strong>
      <span className="achievement-tier-line" data-tier={row.tier ?? 'locked'}>{tierLine(row)}</span>
      <Progress row={row}/>
    </span>
  </button>;
}

function Ladder({ row }: { row: PlayerAchievement }) {
  return <ol className="achievement-ladder">{ACHIEVEMENT_TIERS.map((tier, index) => {
    const state = index < row.level - 1 ? 'done' : index === row.level - 1 ? 'current' : 'future';
    return <li key={tier} data-state={state}>
      <AchievementMedal tier={tier} symbol={row.symbol} size="sm"/>
      <span>{ACHIEVEMENT_TIER_LABEL[tier]}{state === 'current' && <em> · сейчас</em>}</span>
      <span className="achievement-threshold">{row.thresholds[index]}</span>
    </li>;
  })}</ol>;
}

function DetailSheet({ row, pinned, onPin, onClose }: { row: PlayerAchievement; pinned: boolean; onPin?: (id: AchievementId) => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function pin() {
    if (!onPin || busy) return;
    setBusy(true); setError(false);
    try { await onPin(row.id); } catch { setError(true); } finally { setBusy(false); }
  }
  const label = pinned ? 'Закреплено в профиле ✓' : row.level === 0 ? 'Откроется на первом уровне' : busy ? 'Закрепляем…' : 'Закрепить в профиле';
  const footer = onPin && <>
    <button type="button" className="btn primary wide" disabled={pinned || row.level === 0 || busy} onClick={pin}>{label}</button>
    {error && <p className="field-error achievement-error" role="alert">Не получилось закрепить. Попробуй ещё раз.</p>}
  </>;
  return <ActionSheet title={row.title} onClose={onClose} busy={busy} footer={footer || undefined} className="achievement-sheet">
    <div className="achievement-detail-head">
      <AchievementMedal tier={row.tier} symbol={row.symbol} size="lg"/>
      <p className="muted">{row.metric} · {row.current}</p>
    </div>
    <Ladder row={row}/>
  </ActionSheet>;
}

export function PlayerAchievements({ statistics, pinned, onPin }: { statistics: PlayerStatistics; pinned: AchievementId | null; onPin?: (id: AchievementId) => Promise<void> }) {
  const rows = playerAchievements(statistics);
  // Закреплённое сразу после успешного запроса, пока профиль перезапрашивается.
  const [justPinned, setJustPinned] = useState<AchievementId | null>(null);
  useEffect(() => setJustPinned(null), [pinned]);
  const pinnedId = justPinned ?? (isAchievementId(pinned) ? pinned : null);
  const pin = onPin && (async (id: AchievementId) => { await onPin(id); setJustPinned(id); });
  const pinnedRow = rows.find(row => row.id === pinnedId) ?? null;
  const [listOpen, setListOpen] = useState(false);
  const [openId, setOpenId] = useState<AchievementId | null>(null);
  const opened = rows.find(row => row.id === openId);
  return <section className="card material-graphite achievements-card" aria-labelledby="achievements-title">
    <div className="achievements-heading">
      <h2 id="achievements-title">Достижения</h2>
      <button type="button" className="achievements-all" aria-label="Все достижения" onClick={() => setListOpen(true)}>Все {rows.length}<Icon name="back" className="chevron-right"/></button>
    </div>
    <PinnedSlot row={pinnedRow} editable={!!onPin} onOpen={() => pinnedRow && setOpenId(pinnedRow.id)} onBrowse={() => setListOpen(true)}/>
    {listOpen && <ActionSheet title="Достижения" description={`Уровней открыто: ${unlockedLevels(rows)} из ${ACHIEVEMENT_TOTAL_LEVELS}`} onClose={() => setListOpen(false)} className="achievement-sheet">
      <ul className="achievement-list">{rows.map(row => <li key={row.id}>
        <button type="button" className="achievement-row" onClick={() => setOpenId(row.id)}>
          <AchievementMedal tier={row.tier} symbol={row.symbol} size="md"/>
          <span className="achievement-row-copy">
            <strong>{row.title}{row.id === pinnedId && <span className="achievement-pin-mark">в профиле</span>}</strong>
            <span className="achievement-tier-line" data-tier={row.tier ?? 'locked'}>{row.tier ? ACHIEVEMENT_TIER_LABEL[row.tier] : 'Не открыто'}</span>
          </span>
          <span className="achievement-row-progress">{progressText(row)}</span>
        </button>
      </li>)}</ul>
    </ActionSheet>}
    {opened && <DetailSheet row={opened} pinned={opened.id === pinnedId} onPin={pin} onClose={() => setOpenId(null)}/>}
  </section>;
}
