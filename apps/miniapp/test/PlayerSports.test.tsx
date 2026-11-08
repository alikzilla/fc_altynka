import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aggregatePlayerStatistics, type PlayerMeetingStatistics } from '@altynka/core';
import { PlayerSportsCard } from '../src/components/PlayerSports';
import { PlayerGameHistory } from '../src/components/PlayerGameHistory';
import { player,renderWithApp } from './render';

const props={name:'Игрок',username:'player',role:'organizer' as const,playingPosition:'forward' as const,dominantFoot:'left' as const,
  rating:{value:10,initial:5,selfAssessment:null,matchesCount:1},statistics:{...aggregatePlayerStatistics([]),games:4,goals:2,wins:4,winPercentage:100}};
test('approved card exposes real stats, compact identity, integer rating and correct working insole',()=>{
  const {container}=renderWithApp(<PlayerSportsCard {...props}/>,{me:player});
  expect(screen.getByText('@player')).toBeInTheDocument();
  expect(screen.getByRole('img',{name:'Организатор'})).toHaveTextContent('🧑‍✈️');
  expect([...container.querySelector('.player-social')!.children].map(n=>n.className)).toEqual(['player-role','player-social-dot','player-telegram']);
  expect(screen.queryByRole('link',{name:/Изменить позицию/})).toBeNull();
  expect(screen.getByRole('button',{name:/Рейтинг 10 из 10/})).toHaveTextContent('10');
  expect(screen.queryByText('10,0')).not.toBeInTheDocument();
  expect(screen.getByText('Нападающий').closest('.player-statistics-section')).not.toBeNull();
  expect([...container.querySelectorAll('.player-statistics dt')].map(n=>n.textContent)).toEqual(['Голы','Ассисты','Игры','Побед','Нога']);
  expect(container.querySelector('[data-side="left"]')).toHaveAttribute('data-active','true');
  expect(container.querySelector('[data-side="right"]')).toHaveAttribute('data-active','false');
});
test('rating details use FACEIT colours and continuous circles',async()=>{
  const {container}=renderWithApp(<PlayerSportsCard {...props} rating={{...props.rating,value:2.9}}/>,{me:player});
  expect(container.querySelector('.rating-emblem')).toHaveAttribute('data-tier','green');
  await userEvent.click(screen.getByRole('button',{name:/Рейтинг 2,9 из 10/}));
  expect(screen.getByRole('dialog',{name:'Шкала рейтинга'})).toBeInTheDocument();
  expect(document.querySelectorAll('.rating-legend .rating-emblem')).toHaveLength(5);
  expect([...document.querySelectorAll('.rating-legend .rating-emblem')].map(n=>n.getAttribute('data-tier'))).toEqual(['neutral','green','yellow','orange','red']);
});

test('old protocol meetings do not resurface as legacy rows outside the displayed game-history window',()=>{
  const profile={userId:2,displayName:'Игрок',playingPosition:null,dominantFoot:null,rating:props.rating,role:'player' as const,telegramUsername:null,pinnedAchievement:null,statistics:aggregatePlayerStatistics([]),gameHistory:[],
    history:[{eventId:9,date:'2026-10-01',place:'Old protocol venue',community:{id:1,title:'FC Altynka'},score:7,protocolVersion:1 as const}]};
  renderWithApp(<PlayerGameHistory profile={profile}/>,{me:player});
  expect(screen.queryByText('Old protocol venue')).not.toBeInTheDocument();
});

type Outcome = 'win'|'draw'|'loss';
const meeting=(eventId:number,date:string,outcomes:Outcome[],goals:number[],communityId=1):PlayerMeetingStatistics=>({eventId,date,place:null,community:{id:communityId,title:communityId===1?'FC Altynka':'Среда'},colors:['red','blue','yellow'],score:null,
  games:outcomes.length,goals:goals.reduce((a,b)=>a+b,0),wins:outcomes.filter(o=>o==='win').length,draws:outcomes.filter(o=>o==='draw').length,losses:outcomes.filter(o=>o==='loss').length,
  results:outcomes.map((outcome,i)=>({id:`${eventId}-${i}`,sequence:i+1,pair:[0,1] as [number,number],score:[1,0] as [number,number],goals:goals[i]??0,outcome}))});
const m1=meeting(4,'2026-11-06',['win','win','draw'],[2,1,0]);
const m2=meeting(3,'2026-10-30',['loss','win'],[0,0]);
const m3=meeting(2,'2026-10-23',['draw'],[1]);
const m4=meeting(1,'2026-10-16',['win'],[1]);
const profileWith=(gameHistory:PlayerMeetingStatistics[])=>({userId:2,displayName:'Игрок',playingPosition:null,dominantFoot:null,rating:props.rating,role:'player' as const,telegramUsername:null,pinnedAchievement:null,statistics:aggregatePlayerStatistics([]),gameHistory,history:[]});

test('the card lists the latest three meetings as rows with dots and goals', async () => {
  renderWithApp(<PlayerGameHistory profile={profileWith([m1, m2, m3, m4])}/>, { me: player });
  const rows = screen.getAllByRole('button', { name: /гол/ });
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveAccessibleName(/3 гола, победы 2, ничьи 1, поражения 0/);
  expect(rows[0].querySelectorAll('[data-outcome]')).toHaveLength(3);
  await userEvent.click(screen.getByRole('button', { name: 'Все сыгранные матчи' }));
  expect(screen.getByRole('dialog', { name: 'Сыгранные матчи' }).querySelectorAll('button.player-meeting-row')).toHaveLength(4);
});
test('exactly three meetings have no "all" link and a single group hides group tags', () => {
  renderWithApp(<PlayerGameHistory profile={profileWith([m1, m2, m3])}/>, { me: player });
  expect(screen.queryByRole('button', { name: 'Все сыгранные матчи' })).toBeNull();
  expect(document.querySelector('.player-meeting-row .group-tag')).toBeNull();
});
test('meetings from several groups show the group under the date', () => {
  renderWithApp(<PlayerGameHistory profile={profileWith([m1, meeting(9,'2026-10-29',['win'],[0],2)])}/>, { me: player });
  expect(screen.getAllByRole('button', { name: /гол/ })[1]).toHaveTextContent('Среда');
});
test('no meetings shows the empty state inside the graphite card', () => {
  renderWithApp(<PlayerGameHistory profile={profileWith([])}/>, { me: player });
  expect(screen.getByText('Всё начнётся с первой игры').closest('.material-graphite')).not.toBeNull();
});
test('the short-games sheet carries the rating and place removed from the row', async () => {
  renderWithApp(<PlayerGameHistory profile={profileWith([{ ...m1, score: 8.2, place: 'Школа Аксай' }])}/>, { me: player });
  await userEvent.click(screen.getAllByRole('button', { name: /гол/ })[0]);
  const sheet = screen.getByRole('dialog');
  expect(sheet).toHaveTextContent('Оценка 8,2');
  expect(sheet).toHaveTextContent('Школа Аксай');
});
test('with several groups the row name includes the group for screen readers', () => {
  renderWithApp(<PlayerGameHistory profile={profileWith([m1, meeting(9,'2026-10-29',['win'],[0],2)])}/>, { me: player });
  expect(screen.getAllByRole('button', { name: /гол/ })[1]).toHaveAccessibleName(/· Среда$/);
});
