import { CLUBS, CLUB_LEAGUES, CLUB_LEAGUE_LABEL, clubById, type Club, type ClubId, type ClubLeague, type MeDto } from '@altynka/core';
import { useId, useState } from 'react';
import { api } from '../lib/api';
import { getClubId, applyClub, useClubId } from '../lib/theme';
import { haptic } from '../lib/tg';
import { useUpdateMe } from '../state/me';
import { ActionSheet } from './ActionSheet';
import { Icon } from './Icon';
import { useToast } from './ui';

// Ownership survives unmounts: an obsolete answer must not undo a newer choice.
let latestClubOperation = 0;

type Section = 'club' | 'national';
type Filter = 'all' | ClubLeague;

/** Every club in league order: the longest list, so the grid is sized by it from the start (switching filters never moves the sheet). */
const ALL_CLUBS = CLUB_LEAGUES.flatMap(league => CLUBS.filter(c => c.kind === 'club' && c.league === league));

export function ClubPickerSheet({ onClose }: { onClose: () => void }) {
  const current = useClubId();
  const ids = useId();
  const updateMe = useUpdateMe();
  const toast = useToast();
  const [initial] = useState(() => clubById(getClubId()));
  const [section, setSection] = useState<Section>(initial?.kind === 'national' ? 'national' : 'club');
  const [filter, setFilter] = useState<Filter>(initial?.kind === 'club' && initial.league ? initial.league : 'all');
  const visible = section === 'national'
    ? CLUBS.filter(c => c.kind === 'national')
    : filter === 'all'
      ? CLUB_LEAGUES.flatMap(league => CLUBS.filter(c => c.kind === 'club' && c.league === league))
      : CLUBS.filter(c => c.kind === 'club' && c.league === filter);

  async function choose(next: ClubId | null) {
    const previous = getClubId();
    const operation = ++latestClubOperation;
    applyClub(next);
    updateMe(me => ({ ...me, favoriteClub: next }));
    onClose();
    try {
      const updated = await api.send<MeDto>('PATCH', '/api/me', { favoriteClub: next });
      if (operation !== latestClubOperation) return;
      if (updated && 'favoriteClub' in updated) updateMe(me => ({ ...me, favoriteClub: clubById(updated.favoriteClub)?.id ?? null }));
      haptic('success');
    } catch {
      if (operation !== latestClubOperation) return;
      applyClub(previous);
      updateMe(me => ({ ...me, favoriteClub: previous }));
      toast('Не получилось сохранить клуб', { tone: 'error' });
    }
  }

  return <ActionSheet title="Любимый клуб" onClose={onClose} footer={<p className="muted club-picker-note">Список клубов будет пополняться</p>}>
    <div className="club-picker">
      <div className="tabs club-tabs" role="tablist" aria-label="Тип команды">
        <button type="button" role="tab" className={section === 'club' ? 'on' : ''} aria-selected={section === 'club'} onClick={() => setSection('club')}>Клубы</button>
        <button type="button" role="tab" className={section === 'national' ? 'on' : ''} aria-selected={section === 'national'} onClick={() => setSection('national')}>Сборные</button>
      </div>
      {/* The league row stays in place for national teams too (hidden), so switching tabs does not move the grid. */}
      <div className={`club-leagues${section === 'club' ? '' : ' club-leagues-hidden'}`} inert={section !== 'club'} aria-hidden={section !== 'club' || undefined}>
        <button type="button" className={`chip-btn${filter === 'all' ? ' on' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Все</button>
        {CLUB_LEAGUES.map(league => <button key={league} type="button" className={`chip-btn${filter === league ? ' on' : ''}`} aria-pressed={filter === league} onClick={() => setFilter(league)}>{CLUB_LEAGUE_LABEL[league]}</button>)}
      </div>
      <button type="button" className={`club-none${current ? '' : ' on'}`} aria-labelledby={`${ids}-none`} aria-describedby={`${ids}-none-hint`} aria-pressed={!current} onClick={() => void choose(null)}>
        <b id={`${ids}-none`}>Без клуба</b><small id={`${ids}-none-hint`}>Обычная тема</small>{!current && <Icon name="check" />}
      </button>
      <div className="sheet-stack">
        <div className="club-grid">
          {visible.map(club => <ClubTile key={club.id} club={club} on={current === club.id} onChoose={() => void choose(club.id)} />)}
        </div>
        {/* Invisible copy of the longest list: holds the sheet at its full height whatever the filter. */}
        <div className="club-grid sheet-stack-hidden" aria-hidden="true" inert>
          {ALL_CLUBS.map(club => <ClubTile key={club.id} club={club} on={false} />)}
        </div>
      </div>
    </div>
  </ActionSheet>;
}

function ClubTile({ club, on, onChoose }: { club: Club; on: boolean; onChoose?: () => void }) {
  return <button type="button" className={`club-tile${on ? ' on' : ''}`} aria-pressed={on} onClick={onChoose}>
    <img src={club.crest} alt="" loading="lazy" /><span>{club.name}</span>
    {on && <span className="club-tile-check" aria-hidden="true"><Icon name="check" /></span>}
  </button>;
}
