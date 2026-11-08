import { formatRating, playingPositionLabel, type MemberDto, type PlayersDto, type PlayerSummaryDto } from '@altynka/core';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { api, ApiError } from '../lib/api';
import { showGroups, useMe } from '../state/me';
import { EmptyState, ErrorNote, Loading, Screen, useToast } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { GroupTag } from '../components/GroupTag';
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
    catch (err) { toast(err instanceof ApiError && err.code === 'name_taken' ? 'Это имя уже занято' : 'Не получилось сохранить. Попробуй ещё раз.', { tone: 'error' }); }
    finally { setBusy(false); }
  }
  return <div className="editor form">
    {member.role !== 'admin' && <button className="btn wide" disabled={busy} onClick={() => patch({ role: member.role === 'organizer' ? 'player' : 'organizer' })}>{member.role === 'organizer' ? 'Сделать игроком' : 'Сделать организатором'}</button>}
    <label>Имя в списках<input maxLength={24} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
    <button className="btn wide" disabled={busy || !name.trim() || name.trim() === member.displayName} onClick={() => patch({ displayName: name.trim() })}>Имя</button>
  </div>;
}

function PlayerRow({ person, member, communityId, managing, toggle, onSaved }: { person: PlayerSummaryDto; member: MemberDto | undefined; communityId: number; managing: boolean; toggle: () => void; onSaved: () => void }) {
  const [, navigate] = useLocation();
  return <li>
    <button type="button" className="btn-plain player-directory-row" onClick={() => navigate(`/players/${person.userId}`)}>
      <Avatar name={person.displayName} /><span className="player-directory-name"><b>{person.displayName}</b><small className="muted">{person.playingPosition ? playingPositionLabel[person.playingPosition] : 'Позиция не указана'}</small></span>
      <span className="rating-small">{formatRating(person.rating.value)}</span><Icon name="back" className="chevron-right" />
    </button>
    {member && <><button className="btn-text player-management-toggle" aria-expanded={managing} aria-label={`Управление: ${person.displayName}`} onClick={toggle}>Управление</button>
      {managing && <MemberEditor member={member} communityId={communityId} onSaved={onSaved} />}</>}
  </li>;
}

/** Role management is fetched only for a group the viewer administers. */
function GroupSection({ group, titled, search, onChanged }: { group: PlayersDto['groups'][number]; titled: boolean; search: string; onChanged: () => void }) {
  const admin = group.role === 'admin';
  const management = useResource<MemberDto[]>(admin ? `/api/members?communityId=${group.community.id}` : null);
  const [managing, setManaging] = useState<number | null>(null);
  const needle = search.trim().toLocaleLowerCase('ru');
  const players = group.players.filter(p => p.displayName.toLocaleLowerCase('ru').includes(needle));
  if (!players.length) return null;
  const headingId = `players-group-${group.community.id}`;
  return <section className="players-group" aria-labelledby={titled ? headingId : undefined}>
    {titled && <header className="players-group-header"><h2 id={headingId}><GroupTag community={group.community} /></h2><span className="muted">{group.players.length}</span></header>}
    <ul className="card list player-directory">{players.map(person => <PlayerRow key={person.userId} person={person} member={management.data?.find(m => m.userId === person.userId)} communityId={group.community.id} managing={managing === person.userId} toggle={() => setManaging(managing === person.userId ? null : person.userId)} onSaved={() => { onChanged(); management.reload(); }} />)}</ul>
  </section>;
}

export function Players({ selectedUserId }: { selectedUserId?: number } = {}) {
  const me = useMe();
  const [, navigate] = useLocation();
  const { data, error, loading, reload } = useResource<PlayersDto>('/api/players');
  const [search, setSearch] = useState('');
  const needle = search.trim().toLocaleLowerCase('ru');
  const empty = data && !data.groups.some(g => g.players.some(p => p.displayName.toLocaleLowerCase('ru').includes(needle)));
  return <Screen title="Игроки" back="/profile">
    <label className="form player-search"><span className="sr-only">Поиск игрока</span><input type="search" placeholder="Найти по имени" value={search} onChange={e => setSearch(e.target.value)} /></label>
    {loading && !data && <Loading />}{error && <ErrorNote text="Не получилось загрузить игроков" retry={reload} />}
    {empty && <EmptyState title={search ? 'Игрок не найден' : 'В команде пока никого'} text={search ? 'Попробуй другое имя.' : 'Игроки появятся после открытия приложения из группы.'} />}
    {data?.groups.map(group => <GroupSection key={group.community.id} group={group} titled={showGroups(me)} search={search} onChanged={reload} />)}
    <p className="muted">Рейтинг помогает собирать равные команды. Сначала он основан на анкете навыков, которая весит как три матча. Дальше учитываются оценки за последние 10 матчей, где набралось минимум три голоса.</p>
    {selectedUserId !== undefined && <PlayerProfileSheet key={selectedUserId} userId={selectedUserId} onClose={() => navigate('/players', { replace: true })} />}
  </Screen>;
}
