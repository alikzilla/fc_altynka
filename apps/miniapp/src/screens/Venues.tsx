import type { MyCommunityDto, VenueDto, VenuesDto } from '@altynka/core';
import { useId, useState } from 'react';
import { ActionSheet } from '../components/ActionSheet';
import { CONNECT_BOT_TEXT, ConnectGroupButton } from '../components/ConnectGroup';
import { GroupTag } from '../components/GroupTag';
import { Icon } from '../components/Icon';
import { VenuesSkeleton } from '../components/skeletons';
import { EmptyState, ErrorNote, Screen, useReveal, useToast } from '../components/ui';
import { VenueForm, VenueMapLink } from '../components/VenuePicker';
import { useResource } from '../hooks/useResource';
import { api } from '../lib/api';
import { venueRate, venuesPath } from '../lib/venues';
import { showGroups, useMe } from '../state/me';

/** Площадки одной группы. Добавляет, правит и удаляет организатор этой группы; остальные только смотрят. */
function GroupVenues({ community, titled }: { community: MyCommunityDto; titled: boolean }) {
  const { data, error, loading, reload, replace } = useResource<VenuesDto>(venuesPath(community.id));
  const [editing, setEditing] = useState<VenueDto | 'new' | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const formId = useId();
  const reveal = useReveal(loading && !data);
  const manages = community.role !== 'player';
  const headingId = `venues-group-${community.id}`;

  async function remove(venue: VenueDto) {
    setBusy(true);
    try { replace(await api.send<VenuesDto>('DELETE', `/api/venues/${venue.id}`)); setRemoving(null); }
    catch { toast('Не получилось удалить площадку. Попробуй ещё раз.', { tone: 'error' }); }
    finally { setBusy(false); }
  }

  return <section className="venues-group" aria-labelledby={titled ? headingId : undefined} aria-label={titled ? undefined : 'Площадки'}>
    {titled && <header className="players-group-header"><h2 id={headingId}><GroupTag community={community} always /></h2>{data && <span className="muted">{data.venues.length}</span>}</header>}
    {loading && !data && <VenuesSkeleton />}
    {error && !data && <ErrorNote text="Не получилось загрузить площадки" retry={reload} />}
    {data && !data.venues.length && <EmptyState className={reveal} title="Площадок пока нет" text={manages ? 'Добавь поле, где вы играете: его можно будет выбирать для каждого матча.' : 'Организатор ещё не добавил поля, где вы играете.'} />}
    {data && data.venues.length > 0 && <ul className={`venue-cards ${reveal}`}>
      {data.venues.map(venue => <li className="card material-graphite venue-card" key={venue.id}>
        <div className="venue-card-head"><span className="venue-card-icon" aria-hidden="true"><Icon name="pin" /></span>
          <div className="venue-info"><h3 className="venue-name">{venue.name}</h3><p className="venue-address">{venue.address ?? 'Адрес уточняется'}</p></div></div>
        <div className="venue-meta">{venue.mapUrl ? <VenueMapLink url={venue.mapUrl} /> : <span />}<span className="venue-rate">{venueRate(venue)}</span></div>
        {manages && (removing === venue.id
          ? <div className="venue-remove" role="group" aria-label={`Удалить площадку ${venue.name}?`}>
              <p className="muted">Удалить площадку? Матчи, где она уже указана, не изменятся.</p>
              <div><button type="button" className="btn-text danger" disabled={busy} onClick={() => remove(venue)}>{busy ? 'Удаляем…' : 'Удалить'}</button><button type="button" className="btn-text" disabled={busy} onClick={() => setRemoving(null)}>Отмена</button></div>
            </div>
          : <div className="venue-card-actions">
              <button type="button" className="btn-text" aria-label={`Изменить площадку ${venue.name}`} onClick={() => { setRemoving(null); setEditing(venue); }}>Изменить</button>
              <button type="button" className="btn-text" aria-label={`Удалить площадку ${venue.name}`} onClick={() => setRemoving(venue.id)}>Удалить</button>
            </div>)}
      </li>)}
    </ul>}
    {data && manages && <button type="button" className="btn wide venue-add" aria-label={titled ? `Добавить площадку: ${community.title}` : undefined} onClick={() => { setRemoving(null); setEditing('new'); }}><Icon name="plus" />Добавить площадку</button>}
    {editing && <ActionSheet title={editing === 'new' ? 'Новая площадка' : 'Площадка'} className="venue-sheet" onClose={() => setEditing(null)} busy={busy}
      footer={<button className="btn primary wide" type="submit" form={formId} disabled={busy}>{busy ? 'Сохраняем…' : editing === 'new' ? 'Добавить площадку' : 'Сохранить'}</button>}>
      <VenueForm formId={formId} communityId={community.id} venue={editing === 'new' ? undefined : editing} busy={busy} setBusy={setBusy}
        onSaved={dto => { replace(dto); setEditing(null); toast(editing === 'new' ? 'Площадка добавлена' : 'Площадка сохранена'); }} />
    </ActionSheet>}
  </section>;
}

export function Venues() {
  const me = useMe();
  return <Screen title="Площадки" back="/">
    {me.communities.length === 0 && <EmptyState title="Площадок пока нет" text={CONNECT_BOT_TEXT} action={<ConnectGroupButton />} />}
    {me.communities.map(community => <GroupVenues key={community.id} community={community} titled={showGroups(me)} />)}
    {me.communities.length > 0 && <p className="muted stat-note">Площадки общие для группы. Организатор выбирает одну из них, когда назначает матч; цена за час помогает посчитать аренду.</p>}
  </Screen>;
}
