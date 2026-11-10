import { FEED_REACTIONS, FEED_REACTION_EMOJI, FEED_REACTION_LABEL, formatDayMonthRu, todayAlmaty, type FeedDto, type FeedKind, type FeedPostDto, type FeedReaction, type FeedReactionsDto } from '@altynka/core';
import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useResource } from '../hooks/useResource';
import { api } from '../lib/api';
import { GroupTag } from './GroupTag';
import { useMe } from '../state/me';
import { ActionSheet } from './ActionSheet';
import { Avatar, Icon } from './Icon';
import { HomeFeedSkeleton } from './skeletons';
import { ConfirmButton, useReveal, useToast } from './ui';

const PREVIEW = 5;
type IconName = Parameters<typeof Icon>[0]['name'];
const ICON: Record<FeedKind, IconName> = {
  winner: 'trophy', hero: 'flame', hat_trick: 'ball', scorer: 'ball', assistant: 'target', duo: 'people', blowout: 'flame', goal_fest: 'ball',
  streak: 'flame', summary: 'ball', achievement: 'shield', debut: 'user', scoring_run: 'ball', winning_run: 'trophy', top_rated: 'trophy',
  signup_open: 'calendar', scheduled: 'clock', squad_full: 'people', teams_ready: 'shirt',
};

/** The heading of a post, like the author line of a social post: what kind of news this is. */
const LABEL: Record<FeedKind, string> = {
  winner: 'Итог матча', hero: 'Герой матча', hat_trick: 'Хет-трик', scorer: 'Бомбардир', assistant: 'Ассистент', duo: 'Связка',
  blowout: 'Крупный счёт', goal_fest: 'Голевая игра', streak: 'Серия побед', summary: 'Матч в цифрах', achievement: 'Достижение',
  debut: 'Дебют', scoring_run: 'Голевая серия', winning_run: 'Победная серия', top_rated: 'Выбор игроков',
  signup_open: 'Запись открыта', scheduled: 'Время и поле', squad_full: 'Состав собран', teams_ready: 'Составы',
};

/** A post about a player opens the player; teams open the teams tab; a finished match opens its games. */
function target(post: FeedPostDto): string {
  if (post.userId !== null) return `/players/${post.userId}`;
  if (post.kind === 'teams_ready') return `/event/${post.eventId}?tab=teams`;
  if (post.kind === 'signup_open' || post.kind === 'scheduled' || post.kind === 'squad_full' || post.kind === 'top_rated') return `/event/${post.eventId}`;
  return `/event/${post.eventId}?tab=games`;
}

function dayLabel(createdAt: number, now: number): string {
  const day = todayAlmaty(new Date(createdAt));
  if (day === todayAlmaty(new Date(now))) return 'Сегодня';
  if (day === todayAlmaty(new Date(now - 86_400_000))) return 'Вчера';
  return formatDayMonthRu(day);
}

/** Names of players and teams stand out, so the feed can be scanned for «who». */
function emphasise(text: string, names: readonly string[]): ReactNode {
  const found = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length);
  let parts: (string | { name: string })[] = [text];
  for (const name of found) parts = parts.flatMap(part => typeof part !== 'string' ? [part]
    : part.split(name).flatMap((piece, i) => i ? [{ name }, piece] : [piece]));
  return parts.map((part, i) => typeof part === 'string' ? <Fragment key={i}>{part}</Fragment> : <b key={i}>{part.name}</b>);
}

const NONE: Record<FeedReaction, number> = { fire: 0, good: 0, bad: 0 };

/** The same reaction again takes it back; another one replaces it. Counts never go below zero. */
function toggled(post: FeedReactionsDto, reaction: FeedReaction): FeedReactionsDto {
  const reactions = { ...NONE, ...post.reactions };
  const mine = post.myReaction ?? null;
  if (mine) reactions[mine] = Math.max(0, reactions[mine] - 1);
  if (mine === reaction) return { reactions, myReaction: null };
  reactions[reaction]++;
  return { reactions, myReaction: reaction };
}

/** Short stories about played and upcoming matches of the person's groups. Silent when there is nothing to tell. */
export function NewsFeed() {
  const { data, loading, replace, reload } = useResource<FeedDto>('/api/feed');
  const me = useMe();
  const [all, setAll] = useState(false);
  // Posts whose reaction row the person unfolded themselves; those animate, loaded rows do not.
  const [unfolded, setUnfolded] = useState<ReadonlySet<number>>(new Set());
  const [menu, setMenu] = useState<FeedPostDto | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const reveal = useReveal(loading && !data);
  const posts = Array.isArray(data?.posts) ? data.posts : [];
  // The first load holds the place of the cards; a group with nothing to tell shows no section at all.
  if (!posts.length) return loading && !data ? <HomeFeedSkeleton /> : null;
  const now = Date.now();
  const shown = all ? posts : posts.slice(0, PREVIEW);
  const patch = (id: number, next: FeedReactionsDto) => replace(feed => ({ ...feed, posts: feed.posts.map(p => p.id === id ? { ...p, ...next } : p) }));
  // The tap shows at once; the server's counts settle it, and a failure puts the true state back.
  function react(post: FeedPostDto, reaction: FeedReaction) {
    const next = toggled(post, reaction);
    patch(post.id, next);
    api.send<FeedReactionsDto>('PUT', `/api/feed/${post.id}/reaction`, { reaction: next.myReaction })
      .then(saved => patch(post.id, saved))
      .catch(() => { reload(); toast('Не получилось сохранить реакцию'); });
  }
  const isAdmin = (post: FeedPostDto) => me.communities.some(c => c.id === post.community.id && c.role === 'admin');
  function remove(post: FeedPostDto) {
    setBusy(true);
    api.send('DELETE', `/api/feed/${post.id}`)
      .then(() => { replace(feed => ({ ...feed, posts: feed.posts.filter(p => p.id !== post.id) })); toast('Пост удалён'); })
      .catch(() => toast('Не получилось удалить пост'))
      .finally(() => { setBusy(false); setMenu(null); });
  }
  return <section className={`home-section ${reveal}`} aria-labelledby="home-feed">
    <div className="section-heading"><h2 id="home-feed">Лента</h2></div>
    <ul className="feed">
      {shown.map(post => {
        const day = dayLabel(post.createdAt, now), label = LABEL[post.kind] ?? 'Новость';
        const admin = isAdmin(post);
        const empty = FEED_REACTIONS.every(r => !(post.reactions?.[r] > 0)) && !post.myReaction;
        const open = !empty || unfolded.has(post.id);
        return <li key={post.id} className={`card material-graphite feed-post${admin ? ' has-menu' : ''}`}>
          <Link className="feed-open" href={target(post)}>
            <span className="feed-head">
              {post.player ? <Avatar name={post.player.name} photoUrl={post.player.photoUrl} />
                : <span className={`feed-icon${post.teamColor ? ` team-${post.teamColor}` : ''}`}><Icon name={ICON[post.kind] ?? 'ball'} /></span>}
              <span className="feed-meta">{post.player ? <><b>{post.player.name}</b><small>{label} · {day}</small></> : <><b>{label}</b><small>{day}</small></>}</span>
            </span>
            <span className="feed-text">{emphasise(post.text, post.highlights ?? [])}</span>
          </Link>
          {admin && <button type="button" className="player-menu-button feed-menu" aria-label="Действия с постом" onClick={() => setMenu(post)}><Icon name="more" /></button>}
          <div className={`feed-reactions${unfolded.has(post.id) ? ' unfolding' : ''}`} role="group" aria-label="Реакции">
            {open ? FEED_REACTIONS.map(reaction => {
              const count = post.reactions?.[reaction] ?? 0;
              return <button key={reaction} type="button" className="feed-reaction" aria-pressed={post.myReaction === reaction}
                aria-label={`${FEED_REACTION_LABEL[reaction]}${count ? `, ${count}` : ''}`} onClick={() => react(post, reaction)}>
                <span className="feed-emoji" aria-hidden="true">{FEED_REACTION_EMOJI[reaction]}</span>{count > 0 && <span aria-hidden="true">{count}</span>}
              </button>;
            }) : <button type="button" className="feed-reaction feed-react-add" aria-expanded="false" onClick={event => {
              const row = event.currentTarget.parentElement;
              setUnfolded(ids => new Set(ids).add(post.id));
              // The three choices take the place of this button, so the keyboard moves onto the first of them.
              requestAnimationFrame(() => row?.querySelector<HTMLButtonElement>('.feed-reaction')?.focus({ preventScroll: true }));
            }}><Icon name="smile" />Реакция</button>}
            <GroupTag community={post.community} />
          </div>
        </li>;
      })}
    </ul>
    {!all && posts.length > PREVIEW && <button type="button" className="btn-text feed-more" onClick={() => setAll(true)}>Показать ещё</button>}
    {menu && <ActionSheet title="Пост в ленте" description={menu.text} onClose={() => setMenu(null)} busy={busy}>
      <ConfirmButton className="sheet-action danger-text" label="Удалить пост" confirmLabel="Точно удалить? Пост исчезнет у всех" disabled={busy} onConfirm={() => remove(menu)} />
    </ActionSheet>}
  </section>;
}
