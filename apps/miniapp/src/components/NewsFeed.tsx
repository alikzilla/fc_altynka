import { formatDayMonthRu, todayAlmaty, type FeedDto, type FeedKind, type FeedPostDto } from '@altynka/core';
import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useResource } from '../hooks/useResource';
import { GroupTag } from './GroupTag';
import { Icon } from './Icon';
import { useReveal } from './ui';

const PREVIEW = 5;
type IconName = Parameters<typeof Icon>[0]['name'];
const ICON: Record<FeedKind, IconName> = {
  winner: 'trophy', hero: 'flame', hat_trick: 'ball', scorer: 'ball', assistant: 'target', duo: 'people', blowout: 'flame', goal_fest: 'ball',
  streak: 'flame', summary: 'ball', achievement: 'shield', debut: 'user', scoring_run: 'ball', winning_run: 'trophy', top_rated: 'trophy',
  signup_open: 'calendar', scheduled: 'clock', squad_full: 'people', teams_ready: 'shirt',
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

/** Short stories about played and upcoming matches of the person's groups. Silent when there is nothing to tell. */
export function NewsFeed() {
  const { data, loading } = useResource<FeedDto>('/api/feed');
  const [all, setAll] = useState(false);
  const reveal = useReveal(loading && !data);
  const posts = Array.isArray(data?.posts) ? data.posts : [];
  if (!posts.length) return null;
  const now = Date.now();
  const shown = all ? posts : posts.slice(0, PREVIEW);
  return <section className={`home-section ${reveal}`} aria-labelledby="home-feed">
    <div className="section-heading"><h2 id="home-feed">Лента</h2></div>
    <ul className="card material-graphite feed">
      {shown.map(post => <li key={post.id}>
        <Link className="feed-post" href={target(post)}>
          <span className={`feed-icon${post.teamColor ? ` team-${post.teamColor}` : ''}`}><Icon name={ICON[post.kind] ?? 'ball'} /></span>
          <span className="feed-copy">
            <GroupTag community={post.community} />
            <span className="feed-text">{emphasise(post.text, post.highlights ?? [])}</span>
            <small>{dayLabel(post.createdAt, now)}</small>
          </span>
        </Link>
      </li>)}
    </ul>
    {!all && posts.length > PREVIEW && <button type="button" className="btn-text feed-more" onClick={() => setAll(true)}>Показать ещё</button>}
  </section>;
}
