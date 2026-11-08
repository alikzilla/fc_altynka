import { playerAchievements, playingPositionLabel, type DominantFoot, type PlayerRatingDto, type PlayerStatistics, type PlayingPosition, type Role } from '@altynka/core';
import { useState } from 'react';
import { Link } from 'wouter';
import { ActionSheet } from './ActionSheet';
import { Avatar, Icon } from './Icon';

const format = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const tier = (value?: number) => value === undefined ? 'unknown' : value < 2 ? 'neutral' : value < 4 ? 'green' : value < 8 ? 'yellow' : value < 10 ? 'orange' : 'red';
function RatingRing({ value }: { value?: number }) {
  return <span className="rating-emblem" data-tier={tier(value)}>
    <svg viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <circle className="rank-core" cx="36" cy="36" r="23" />
      <circle className="rank-track" cx="36" cy="36" r="29" />
      {value !== undefined && <circle className="rank-progress" cx="36" cy="36" r="29" pathLength="100" strokeDasharray={`${Math.max(0,Math.min(10,value))*10} 100`} transform="rotate(-90 36 36)" />}
    </svg><strong>{value === undefined ? '?' : format(value)}</strong>
  </span>;
}
function RatingBadge({ rating }: { rating?: PlayerRatingDto | null }) {
  const [open,setOpen] = useState(false);
  const examples = [{value:1,range:'1',label:'Серый'},{value:2.9,range:'2–3',label:'Зелёный'},{value:5.5,range:'4–7',label:'Жёлтый'},{value:8.8,range:'8–9',label:'Оранжевый'},{value:10,range:'10',label:'Красный'}];
  return <><div role="group" aria-label="Рейтинг игрока"><button type="button" className="rating-badge" aria-haspopup="dialog" aria-label={rating ? `Рейтинг ${format(rating.value)} из 10. Показать шкалу` : 'Рейтинг пока не указан. Показать шкалу'} onClick={()=>setOpen(true)}><RatingRing value={rating?.value} /><small className="rating-caption">{rating ? 'Рейтинг' : 'Нет рейтинга'}</small></button></div>
    {open && <ActionSheet title="Шкала рейтинга" onClose={()=>setOpen(false)}>
      <p className="rating-scale-intro">Рейтинг — от 1 до 10. Чем он выше, тем полнее кольцо.</p>
      <div className="rating-legend">{examples.map(row=><div className="rating-legend-item" key={row.range}><RatingRing value={row.value}/><b>{row.range}</b><span>{row.label}</span></div>)}</div>
      <p className="rating-scale-note">Цвет соответствует целому уровню. Числа внутри колец — примеры рейтинга.</p>
      {rating && <p className="rating-scale-note">{rating.matchesCount ? `В рейтинге учтено матчей: ${rating.matchesCount}.` : rating.selfAssessment ? 'Текущий рейтинг — по стартовой анкете.' : 'Текущий рейтинг пока предварительный.'}</p>}
    </ActionSheet>}
  </>;
}

const insole = 'M13.8 2.5C8.2 2 4.5 7.2 4.4 13.2c-.1 3.9 1.6 6.2 2.6 9.3.8 2.5 0 5.8 2 7.8 1.6 1.8 5.9 1.3 7.1-.8 1.6-2.8-1.1-6.4-.7-9.3.4-3.8 4.1-7.9 3.9-11.7-.1-3.5-1.7-5.7-5.5-6Z';
function WorkingFoot({ foot }: { foot?: DominantFoot | null }) {
  const label = foot === 'both' ? 'Обе ноги' : foot === 'left' ? 'Левая нога' : foot === 'right' ? 'Правая нога' : 'Рабочая нога не указана';
  return <dd><span role="img" aria-label={label} title={label}><svg className="dominant-feet" viewBox="0 0 48 34" fill="currentColor" aria-hidden="true">
    <g data-side="left" data-active={foot==='left'||foot==='both'}><path d={insole}/></g>
    <g data-side="right" data-active={foot==='right'||foot==='both'} transform="translate(48 0) scale(-1 1)"><path d={insole}/></g>
  </svg></span></dd>;
}

interface Props {
  name: string; username?: string | null; photoUrl?: string | null; role: Role;
  playingPosition?: PlayingPosition | null; dominantFoot?: DominantFoot | null;
  rating?: PlayerRatingDto | null; statistics?: PlayerStatistics;
  /** Own profile only: where the position and foot sheet opens. */
  editPositionHref?: string;
}
const roles={admin:{emoji:'🧑‍💻',label:'Администратор'},organizer:{emoji:'🧑‍✈️',label:'Организатор'},player:{emoji:'⚽️',label:'Игрок'}};
export function PlayerSportsCard({name,username,photoUrl,role,playingPosition,dominantFoot,rating,statistics,editPositionHref}:Props) {
  const personRole=roles[role];
  return <section className="card material-plum player-sports-card" aria-label="Профиль игрока">
    <div className="player-card-top"><Avatar name={name} photoUrl={photoUrl} large/>
      <div className="player-identity"><h2>{name}</h2><div className="player-social"><span className="player-role" role="img" aria-label={personRole.label} title={personRole.label}>{personRole.emoji}</span>{username && <><span className="player-social-dot" aria-hidden="true">·</span><span className="player-telegram" title={`@${username}`}>@{username}</span></>}</div></div>
      <RatingBadge rating={rating}/>
    </div>
    <div className="player-statistics-section"><div className="player-position-row"><p className="player-position-line">{playingPosition ? playingPositionLabel[playingPosition] : 'Позиция не указана'}</p>
        {editPositionHref && <Link className="player-position-edit" href={editPositionHref} aria-label="Изменить позицию и рабочую ногу">Изменить</Link>}</div>
      <dl className="player-statistics" aria-label="Статистика за всё время и рабочая нога">
        <div className="goals"><dt>Голы</dt><dd>{statistics?.goals??'—'}</dd></div>
        <div className="assists"><dt>Ассисты</dt><dd aria-label="Пока не считаются">—</dd></div>
        <div><dt>Игры</dt><dd>{statistics?.games??'—'}</dd></div>
        <div className="wins-stat"><dt>Побед</dt><dd>{statistics?.winPercentage==null?'—':<>{statistics.winPercentage}<small>%</small></>}</dd></div>
        <div className="foot-stat"><dt>Нога</dt><WorkingFoot foot={dominantFoot}/></div>
      </dl>
    </div>
  </section>;
}

export function PlayerAchievements({statistics}:{statistics:PlayerStatistics}) {
  const rows=playerAchievements(statistics);
  return <section className="achievements-section" aria-labelledby="achievements-title"><div className="achievements-heading"><h2 id="achievements-title">Достижения</h2><span>{rows.filter(row=>row.earned).length} из {rows.length}</span></div>
    <div className="achievements-grid">{rows.map(row=><article className={`achievement${row.earned?' is-earned':''}`} key={row.id} aria-label={`${row.title}: ${row.earned?'получено':`${Math.min(row.current,row.target)} из ${row.target}`}`}>
      <div className="achievement-symbol"><Icon name={row.symbol as 'ball'|'flame'|'trophy'|'target'|'shirt'|'shield'}/>{row.earned && <Icon name="check"/>}</div>
      <h3>{row.title}</h3><p>{row.description}</p><div className="achievement-progress"><span>{row.earned?'Получено':`${Math.min(row.current,row.target)} / ${row.target}`}</span><progress max={row.target} value={Math.min(row.current,row.target)} aria-label={`Прогресс: ${row.title}`}/></div>
    </article>)}</div>
  </section>;
}
