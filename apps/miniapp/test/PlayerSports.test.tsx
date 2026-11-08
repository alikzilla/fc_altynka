import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aggregatePlayerStatistics } from '@altynka/core';
import { PlayerSportsCard } from '../src/components/PlayerSports';
import { PlayerGameHistory } from '../src/components/PlayerGameHistory';
import { player,renderWithApp } from './render';

const props={name:'Игрок',username:'player',role:'organizer' as const,playingPosition:'forward' as const,dominantFoot:'left' as const,
  rating:{value:10,initial:5,selfAssessment:null,matchesCount:1},statistics:{...aggregatePlayerStatistics([]),games:4,goals:2,wins:4,winPercentage:100}};
test('approved card exposes real stats, compact identity, integer rating and correct working insole',()=>{
  const {container}=renderWithApp(<PlayerSportsCard {...props}/>,{me:player});
  expect(screen.getByText('@player')).toBeInTheDocument();
  expect(screen.getByRole('img',{name:'Организатор'})).toHaveTextContent('🧑‍✈️');
  expect([...container.querySelector('.player-social')!.children].map(n=>n.className)).toEqual(['player-role','player-telegram']);
  expect(screen.getByRole('button',{name:/Рейтинг 10 из 10/})).toHaveTextContent('10');
  expect(screen.queryByText('10,0')).not.toBeInTheDocument();
  expect(screen.getByText('Нападающий').closest('.player-statistics-section')).not.toBeNull();
  expect([...container.querySelectorAll('.player-statistics dt')].map(n=>n.textContent)).toEqual(['Голы','Ассисты','Игры','Побед','Ноги']);
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
  const profile={userId:2,displayName:'Игрок',playingPosition:null,dominantFoot:null,rating:props.rating,role:'player' as const,telegramUsername:null,statistics:aggregatePlayerStatistics([]),gameHistory:[],
    history:[{eventId:9,date:'2026-10-01',place:'Old protocol venue',community:{id:1,title:'FC Altynka'},score:7,protocolVersion:1 as const}]};
  renderWithApp(<PlayerGameHistory profile={profile}/>,{me:player});
  expect(screen.queryByText('Old protocol venue')).not.toBeInTheDocument();
});
