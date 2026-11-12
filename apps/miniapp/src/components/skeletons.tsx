/**
 * Скелеты повторяют загруженную разметку: те же классы карточек, отступы и высоты строк.
 * Постоянные подписи остаются текстом, данные заменяет <Sk />. Меняешь экран — поправь и его скелет.
 */
import { MATCH_FORMATS } from '@altynka/core';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { Icon } from './Icon';
import { matchOrigin } from '../lib/navHistory';
import { Screen, Sk, Skeleton } from './ui';

const times = (count: number) => Array.from({ length: count }, (_, index) => index);
/** Ширины строк чередуются, чтобы список не выглядел штампованным. */
const pick = (widths: string[], index: number) => widths[index % widths.length];

function SkGroupTag({ show }: { show: boolean }) {
  return show ? <span className="group-tag"><i className="sk-fill" /><span><Sk w="6em" /></span></span> : null;
}

/** Каркас — настоящий Screen: заголовок, «Назад» и жест от края работают, пока экран грузится. */
function SkFrame({ title, back, subtitle, className, children }: { title: string; back?: string; subtitle?: boolean; className?: string; children: ReactNode }) {
  return <Screen title={title} back={back} subtitle={subtitle ? <Sk w="5.5em" /> : undefined} className={className}>{children}</Screen>;
}

/* ——— Главная ——— */

export function HomeMatchSkeleton() {
  return <Skeleton>
    <div className="match-carousel single">
      <div className="card match-card material-plum">
        <p className="match-day"><Sk w="38%" /></p>
        <p className="match-headline"><Sk w="56%" /></p>
        <p className="match-when"><Sk w="74%" /></p>
        <div className="match-tags"><span className="match-tag"><Sk w="6.5em" /></span><span className="match-tag"><Sk w="3em" /></span></div>
        <span className="btn primary match-link sk-fill" />
      </div>
    </div>
  </Skeleton>;
}

function TaskPreviewSkeleton({ groups, index }: { groups: boolean; index: number }) {
  return <div className="card task-preview material-blue">
    <span className="task-icon" />
    <span className="task-copy"><SkGroupTag show={groups} /><b><Sk w={pick(['52%', '40%'], index)} /></b><small><Sk w={pick(['34%', '46%'], index)} /></small></span>
    <Icon name="back" className="chevron-right" />
  </div>;
}

export function HomeTasksSkeleton({ groups }: { groups: boolean }) {
  return <Skeleton><div className="task-list compact-tasks">{times(2).map(index => <TaskPreviewSkeleton key={index} groups={groups} index={index} />)}</div></Skeleton>;
}

/** Карточка поста ленты: шапка с кругом и двумя строками, две строки текста, кнопка реакции. */
function FeedPostSkeleton({ index }: { index: number }) {
  return <li className="card material-graphite feed-post">
    <span className="feed-open">
      <span className="feed-head">
        <span className="feed-icon sk-fill" />
        <span className="feed-meta"><b><Sk w={pick(['34%', '46%', '28%'], index)} /></b><small><Sk w={pick(['42%', '30%', '38%'], index)} /></small></span>
      </span>
      <span className="feed-text"><Sk w="94%" /> <Sk w={pick(['52%', '70%', '38%'], index)} /></span>
    </span>
    <div className="feed-reactions"><span className="feed-reaction feed-react-add sk-fill"><Icon name="smile" />Реакция</span></div>
  </li>;
}

export function HomeFeedSkeleton() {
  return <section className="home-section"><div className="section-heading"><h2>Лента</h2></div>
    <Skeleton><ul className="feed">{times(3).map(index => <FeedPostSkeleton key={index} index={index} />)}</ul></Skeleton>
  </section>;
}

/* ——— Матчи ——— */

function EventRowSkeleton({ groups, index }: { groups: boolean; index: number }) {
  return <div className="event-row">
    <span className="event-date-tile"><span><Sk w=".9em" /></span><small><Sk w="2.2em" /></small></span>
    <span className="event-row-copy"><SkGroupTag show={groups} /><b><Sk w={pick(['46%', '58%', '40%'], index)} /></b><span className="muted"><Sk w={pick(['70%', '56%', '64%'], index)} /></span></span>
    <span className="row-chip"><Sk w="3.2em" /></span>
    <Icon name="back" className="chevron-right" />
  </div>;
}

export function ActiveMatchesSkeleton({ groups }: { groups: boolean }) {
  return <Skeleton>
    <p className="muted"><Sk w="62%" /></p>
    <div className="card archive-list material-blue">{times(3).map(index => <EventRowSkeleton key={index} groups={groups} index={index} />)}</div>
  </Skeleton>;
}

export function PastMatchesSkeleton({ groups }: { groups: boolean }) {
  return <Skeleton>
    {[4, 2].map((rows, month) => <section className="archive-month" key={month}>
      <h2><Sk w="28%" /></h2>
      <div className={`card archive-list ${month % 2 ? 'material-blue' : 'material-graphite'}`}>{times(rows).map(index => <EventRowSkeleton key={index} groups={groups} index={index + month} />)}</div>
    </section>)}
  </Skeleton>;
}

/* ——— Задачи ——— */

export function TaskListSkeleton({ groups }: { groups: boolean }) {
  return <Skeleton>
    <div className="task-list">{times(2).map(index => <div className="card task-card material-blue" key={index}>
      <SkGroupTag show={groups} />
      <p className="task-type"><span className="sk-icon sk-fill" /><span><Sk w={pick(['8em', '6.5em'], index)} /></span></p>
      <p className="muted"><Sk w={pick(['48%', '36%'], index)} /></p>
      <p className="muted"><Sk w="94%" /> <Sk w={pick(['58%', '70%'], index)} /></p>
      <span className="btn wide sk-fill" />
    </div>)}</div>
  </Skeleton>;
}

/* ——— Игроки и профиль ——— */

export function PlayersSkeleton() {
  return <Skeleton>
    <section className="players-group">
      <div className="card list player-directory">{times(6).map(index => <div className="btn-plain player-directory-row" key={index}>
        <span className="avatar sk-fill" />
        <span className="player-directory-name"><b><Sk w={pick(['58%', '44%', '66%'], index)} /></b><small className="muted"><Sk w={pick(['34%', '42%'], index)} /></small></span>
        <span className="rating-small"><Sk w="1.5em" /></span>
        <Icon name="back" className="chevron-right" />
      </div>)}</div>
    </section>
  </Skeleton>;
}

/** Таблица статистики: те же строки, что после загрузки; подиум появляется только при трёх игроках. */
export function StatisticsSkeleton() {
  return <Skeleton>
    <div className="card list stat-list">{times(6).map(index => <div className="btn-plain stat-row" key={index}>
      <span className="stat-rank">{index + 1}</span>
      <span className="avatar sk-fill" />
      <span className="stat-name"><b><Sk w={pick(['58%', '44%', '66%'], index)} /></b><small className="muted"><Sk w="62%" /></small></span>
      <span className="stat-value"><Sk w="1.2em" /></span>
    </div>)}</div>
  </Skeleton>;
}

const STATS: [string, string][] = [['goals', 'Голы'], ['assists', 'Ассисты'], ['', 'Игры'], ['wins-stat', 'Побед'], ['foot-stat', 'Нога']];

function PlayerSportsSkeleton() {
  return <section className="card material-plum player-sports-card">
    <div className="player-card-top">
      <span className="avatar avatar-large sk-pulse" />
      <div className="player-identity">
        <h2><Sk w="72%" /></h2>
        <div className="player-social"><span className="player-role sk-fill sk-round" /><span className="player-telegram"><Sk w="6.5em" /></span></div>
      </div>
      <span className="rating-badge">
        <span className="rating-emblem" data-tier="unknown"><svg viewBox="0 0 72 72" fill="none"><circle className="rank-core" cx="36" cy="36" r="23" /><circle className="rank-track" cx="36" cy="36" r="29" /></svg></span>
        <small className="rating-caption"><Sk w="4em" /></small>
      </span>
    </div>
    <div className="player-statistics-section">
      <div className="player-position-row"><p className="player-position-line"><Sk w="8em" /></p></div>
      <dl className="player-statistics">{STATS.map(([className, label]) => <div className={className || undefined} key={label}><dt>{label}</dt><dd><Sk w="1.1em" /></dd></div>)}</dl>
    </div>
  </section>;
}

function AchievementsSkeleton() {
  return <section className="card material-graphite achievements-card">
    <div className="achievements-heading"><h2>Достижения</h2><span className="achievements-all"><Sk w="3em" /></span></div>
    <div className="achievement-pinned">
      <span className="achievement-medal sk-pulse" data-size="lg" data-tier="locked" />
      <span className="achievement-pinned-copy">
        <small><Sk w="34%" /></small>
        <strong><Sk w="62%" /></strong>
        <span className="achievement-tier-line"><Sk w="48%" /></span>
        <div className="achievement-progress"><span className="sk-progress" /><p><span><Sk w="5em" /></span><span><Sk w="3em" /></span></p></div>
      </span>
    </div>
  </section>;
}

function GameHistorySkeleton() {
  return <section className="card material-graphite player-meeting-history">
    <div className="player-meeting-heading"><h2>Сыгранные матчи</h2></div>
    <div className="player-meeting-rows">{times(3).map(index => <div className="player-meeting-row" key={index}>
      <span className="player-meeting-when"><strong><Sk w={pick(['7em', '6em', '7.5em'], index)} /></strong><span className="player-meeting-dots sk-dots">{times([3, 4, 2][index]).map(dot => <i key={dot} />)}</span></span>
      <span className="player-meeting-goals"><Sk w="3.4em" /></span>
      <Icon name="back" className="chevron-right" />
    </div>)}</div>
  </section>;
}

/** Профиль другого игрока в шторке: карточка, достижения, сыгранные матчи. */
export function PlayerProfileSkeleton() {
  return <Skeleton><div className="player-profile-content"><PlayerSportsSkeleton /><AchievementsSkeleton /><GameHistorySkeleton /></div></Skeleton>;
}

/** Свой профиль: карточка уже нарисована из /api/me, догружаются достижения и матчи. */
export function ProfileStatisticsSkeleton() {
  return <Skeleton><AchievementsSkeleton /><GameHistorySkeleton /></Skeleton>;
}

/* ——— Матч ——— */

function EventSummarySkeleton() {
  return <section className="card material-plum event-summary">
    <div className="match-summary-top"><SkGroupTag show /><p className="match-detail-time"><Sk w="5.6em" /></p></div>
    <p className="match-detail-place"><Icon name="pin" /><span><Sk w="9em" /></span></p>
    <div className="match-personal"><span className="match-personal-status"><Sk w="8em" /></span><span className="btn-text"><Sk w="4.5em" /></span></div>
  </section>;
}

function ParticipantsSkeleton() {
  return <section>
    <div className="section-heading match-list-heading"><h2>Основа <span className="match-count"><Sk w="2.2em" /></span></h2></div>
    <div className="card list material-graphite">{times(6).map(index => <div className="person" key={index}>
      <span className="num"><Sk w=".7em" /></span><span className="avatar sk-fill" /><span className="name"><Sk w={pick(['46%', '58%', '38%', '52%'], index)} /></span>
    </div>)}</div>
  </section>;
}

function TeamsSkeleton() {
  return <div className="team-editor">
    {times(2).map(team => <section className="card material-graphite team-card" key={team}>
      <header className="team-card-head"><span className="team-shirt sk-fill" style={{ borderRadius: 8 }} /><div className="team-card-title"><h2><Sk w="6em" /></h2><p className="team-card-meta"><Sk w="8em" /></p></div></header>
      <ul className="team-card-players">{times(4).map(index => <li className="team-card-player" key={index}><div className="team-row-static"><Sk w={pick(['8em', '6em', '9em', '7em'], index + team)} /></div></li>)}</ul>
    </section>)}
  </div>;
}

function BillSkeleton() {
  return <section className="card material-coral pay">
    <p className="payment-label"><Sk w="7em" /></p>
    <p className="payment-amount"><Sk w="5em" /></p>
    <p className="payment-person"><Sk w="55%" /></p>
    <span className="btn primary wide sk-fill" />
  </section>;
}

function GamesSkeleton() {
  return <div className="match-games">
    <section className="card material-blue game-current">
      <div className="row between"><span className="game-current-meta"><Sk w="4em" /></span></div>
      <div className="game-versus">{times(2).map(side => <Fragment key={side}>{side === 1 && <span className="game-vs">VS</span>}<div className="game-side"><span className="game-kit sk-fill" /><b><Sk w="5em" /></b><small><Sk w="3.5em" /></small></div></Fragment>)}</div>
      <span className="btn primary wide sk-fill" />
    </section>
    <section className="card material-graphite game-standings-section"><h2>Таблица</h2>{times(3).map(index => <p className="sk-table-row" key={index}><Sk w="100%" /></p>)}</section>
    <section className="card material-graphite game-history"><div className="game-history-heading"><h2>Последние игры</h2></div>{times(2).map(index => <p className="sk-table-row" key={index}><Sk w="100%" /></p>)}</section>
  </div>;
}

/** Вкладка, чей код ещё грузится: Участники, Составы, Игры или Оплата. */
export function EventTabSkeleton({ tab }: { tab: string }) {
  return <Skeleton>{tab === 'teams' ? <TeamsSkeleton /> : tab === 'bill' ? <BillSkeleton /> : tab === 'games' ? <GamesSkeleton /> : <ParticipantsSkeleton />}</Skeleton>;
}

/** Страница матча целиком: сводка, вкладки, список участников. */
export function EventSkeleton() {
  return <Skeleton>
    <EventSummarySkeleton />
    <div className="tabs">{times(3).map(index => <span className={`tab-sk ${index ? '' : 'on'}`} key={index}><Sk w="5em" /></span>)}</div>
    <div className="tab-panel"><ParticipantsSkeleton /></div>
  </Skeleton>;
}

/** Шторка назначения матча: те же поля, без значений. */
export function ScheduleSkeleton() {
  return <Skeleton>
    <div className="form">
      <fieldset className="form-fields">
        <label>Начало<span className="temporal-field"><Sk w="3em" /></span></label>
        <fieldset className="form-fields"><legend className="schedule-field-label">Продолжительность</legend><div className="schedule-duration">
          {['1 час', '2 часа'].map(label => <span className="chip-btn sk-chip" key={label}><b>{label}</b></span>)}
        </div></fieldset>
        <fieldset className="form-fields"><legend className="schedule-field-label">Формат</legend><div className="schedule-duration">
          {MATCH_FORMATS.map(f => <span className="chip-btn sk-chip" key={f.limit}><b>{f.label}</b><small>{f.limit} игроков в основе</small></span>)}
        </div></fieldset>
        <div><span className="schedule-field-label">Место проведения <span>· необязательно</span></span>
          <span className="venue-trigger"><Icon name="pin" /><span><Sk w="9em" /></span><Icon name="back" className="venue-chevron" /></span>
        </div>
        <p className="muted">Участники получат время и место матча в уведомлении.</p>
      </fieldset>
    </div>
  </Skeleton>;
}

export function ScheduleFooterSkeleton() {
  return <span className="btn primary wide sk-fill" aria-hidden="true" />;
}

/* ——— Оценка матча ——— */

export function ReviewSkeleton() {
  return <Skeleton>
    <div className="card material-blue"><h2><Sk w="54%" /></h2><p><Sk w="96%" /> <Sk w="88%" /> <Sk w="40%" /></p><p className="muted"><Sk w="92%" /> <Sk w="44%" /></p><p className="muted"><Sk w="52%" /></p></div>
    <section className="card review-entry-card">
      <h2><Sk w="44%" /></h2>
      <div className="review-entry-players">{times(4).map(index => <span className="avatar sk-fill" key={index} />)}<span className="muted"><Sk w="7em" /></span></div>
      <p className="muted"><Sk w="94%" /> <Sk w="36%" /></p>
      <span className="btn primary wide sk-fill" />
    </section>
  </Skeleton>;
}

/* ——— Экран до загрузки аккаунта или кода маршрута ——— */

/**
 * Каркас экрана для маршрута: пока грузится /api/me или код экрана, видно тот же заголовок и те же
 * карточки, что появятся после загрузки.
 */
export function RouteSkeleton({ path, search = '' }: { path: string; search?: string }) {
  if (path === '/matches') {
    const past = new URLSearchParams(search).get('view') === 'past';
    return <SkFrame title="Матчи">
      <div className="tabs match-tabs">{['Активные', 'Прошлые'].map((label, index) => <span className={`tab-sk ${!!index === past ? 'on' : ''}`} key={label}>{label}</span>)}</div>
      <div className="tab-panel matches-panel">{past ? <PastMatchesSkeleton groups={false} /> : <ActiveMatchesSkeleton groups={false} />}</div>
    </SkFrame>;
  }
  if (path === '/notifications') return <SkFrame title="Задачи"><TaskListSkeleton groups={false} /></SkFrame>;
  const review = /^\/event\/(\d+)\/review$/.exec(path);
  if (review) return <SkFrame title="Оценка матча" back={`/event/${review[1]}`}><ReviewSkeleton /></SkFrame>;
  if (/^\/event\/\d+/.test(path)) return <SkFrame title="Матч" back={matchOrigin()} subtitle className="match-screen"><EventSkeleton /></SkFrame>;
  if (path.startsWith('/players')) return <SkFrame title="Игроки" back="/profile"><div className="form player-search"><span className="sk-search">Найти по имени</span></div><PlayersSkeleton /></SkFrame>;
  if (path === '/stats') return <SkFrame title="Статистика" back="/"><div className="tabs stat-boards">{['Голы', 'Пасы', 'Гол+пас', 'Игры', 'Победы'].map((label, index) => <span className={`tab-sk ${index ? '' : 'on'}`} key={label}>{label}</span>)}</div><StatisticsSkeleton /></SkFrame>;
  if (path === '/profile/skills') return <SkFrame title="Твоя игра" back="/profile"><Skeleton><div className="card material-blue"><h2><Sk w="54%" /></h2><p><Sk w="96%" /> <Sk w="62%" /></p><span className="btn primary wide sk-fill" /></div></Skeleton></SkFrame>;
  if (path.startsWith('/profile')) return <SkFrame title="Профиль"><PlayerProfileSkeleton /></SkFrame>;
  return <SkFrame title="Ближайший матч">
    <HomeMatchSkeleton />
    <section className="home-section"><div className="section-heading"><h2>Нужно сделать</h2><Link href="/notifications">Все задачи<Icon name="arrow" /></Link></div><HomeTasksSkeleton groups={false} /></section>
    <HomeFeedSkeleton />
  </SkFrame>;
}
