import { formatRating, playingPositionLabel, type MemberDto, type PlayersDto } from '@altynka/core';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { api, ApiError } from '../lib/api';
import { useMe } from '../state/me';
import { EmptyState, ErrorNote, Loading, Screen, useToast } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { Avatar, Icon } from '../components/Icon';
import { PlayerProfileSheet } from './PlayerProfile';

function MemberEditor({ member, communityId, onSaved }: { member: MemberDto; communityId: number; onSaved: () => void }) {
  const [name, setName] = useState(member.displayName);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function patch(body: { displayName?: string; role?: 'organizer' | 'player' }) {
    if (busy) return;
    setBusy(true);
    try { await api.send('PATCH', `/api/members/${member.userId}?communityId=${communityId}`, body); onSaved(); }
    catch (err) { toast(err instanceof ApiError && err.code === 'name_taken' ? 'Это имя уже занято' : 'Не получилось сохранить'); }
    finally { setBusy(false); }
  }
  return <div className="editor form">
    {member.role !== 'admin' && <button className="btn wide" disabled={busy} onClick={() => patch({ role: member.role === 'organizer' ? 'player' : 'organizer' })}>{member.role === 'organizer' ? 'Сделать игроком' : 'Сделать организатором'}</button>}
    <label>Имя в списках<input maxLength={24} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
    <button className="btn wide" disabled={busy || !name.trim() || name.trim() === member.displayName} onClick={() => patch({ displayName: name.trim() })}>Имя</button>
  </div>;
}

export function Players({ selectedUserId }: { selectedUserId?: number } = {}) {
  const me = useMe();
  const [, navigate] = useLocation();
  const { data: directory, error, loading, reload } = useResource<PlayersDto>('/api/players');
  // TEMP (Task 7): flattened across groups; management limited to the first group the user administers.
  const data = directory && [...new Map(directory.groups.flatMap(g => g.players).map(p => [p.userId, p])).values()];
  const adminCommunityId = me.communities.find(c => c.role === 'admin')?.id;
  const management = useResource<MemberDto[]>(adminCommunityId ? `/api/members?communityId=${adminCommunityId}` : null);
  const [search, setSearch] = useState('');
  const [managing, setManaging] = useState<number | null>(null);
  const filtered = data?.filter(p => p.displayName.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')));
  return <Screen title="Игроки команды" back="/profile">
    <label className="form player-search"><span className="sr-only">Поиск игрока</span><input type="search" placeholder="Найти по имени" value={search} onChange={e => setSearch(e.target.value)} /></label>
    {loading && !data && <Loading />}{error && <ErrorNote text="Не получилось загрузить игроков" retry={reload} />}
    {filtered && !filtered.length && <EmptyState title={search ? 'Игрок не найден' : 'В команде пока никого'} text={search ? 'Попробуй другое имя.' : 'Игроки появятся после открытия приложения из группы.'} />}
    {filtered && filtered.length > 0 && <ul className="card list player-directory">{filtered.map(person => {
      const member = management.data?.find(m => m.userId === person.userId);
      return <li key={person.userId}>
        <button type="button" className="btn-plain player-directory-row" onClick={() => navigate(`/players/${person.userId}`)}>
          <Avatar name={person.displayName} /><span className="player-directory-name"><b>{person.displayName}</b><small className="muted">{person.playingPosition ? playingPositionLabel[person.playingPosition] : 'Позиция не указана'}</small></span>
          <span className="rating-small">{formatRating(person.rating.value)}</span><Icon name="back" className="chevron-right" />
        </button>
        {member && <><button className="btn-text player-management-toggle" aria-expanded={managing === person.userId} aria-label={`Управление: ${person.displayName}`} onClick={() => setManaging(managing === person.userId ? null : person.userId)}>Управление</button>
          {managing === person.userId && adminCommunityId && <MemberEditor member={member} communityId={adminCommunityId} onSaved={() => { reload(); management.reload(); }} />}</>}
      </li>;
    })}</ul>}
    <p className="muted">Рейтинг помогает собирать равные команды. Сначала он основан на анкете, затем уточняется оценками матчей.</p>
    {selectedUserId !== undefined && <PlayerProfileSheet key={selectedUserId} userId={selectedUserId} onClose={() => navigate('/players', { replace: true })} />}
  </Screen>;
}
