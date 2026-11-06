import type { EventDetailDto } from '@altynka/core';
import { screen } from '@testing-library/react';
import { MatchGames } from '../src/screens/MatchGames';
import { organizer, player, renderWithApp } from './render';
import { makeProtocol } from './gameFixtures';

vi.mock('../src/lib/api'); vi.mock('../src/lib/tg');
const ev={id:7,protocolVersion:1,viewerRole:'player',community:{id:1,title:'FC Altynka'},gameProtocol:makeProtocol({canRecord:false,canEdit:false,canFinish:false})} as EventDetailDto;
test('player sees pair, rest, table and empty history without organizer actions',()=>{
  renderWithApp(<MatchGames ev={ev} reload={()=>{}}/>,{me:player});
  expect(screen.getByRole('table',{name:'Таблица команд'})).toBeVisible();
  expect(screen.getByText(/Отдыхают/)).toHaveTextContent('Жёлтые');
  expect(screen.queryByRole('button',{name:'Внести результат'})).toBeNull();
  expect(screen.getByRole('heading',{name:'Бомбардиры'})).toBeVisible();
});
test('organizer can record, and completed meetings keep edits but no new result',()=>{
  const result=renderWithApp(<MatchGames ev={{...ev,viewerRole:'organizer',gameProtocol:makeProtocol()}} reload={()=>{}}/>,{me:organizer});
  expect(screen.getByRole('button',{name:'Внести результат'})).toBeVisible(); result.unmount();
  renderWithApp(<MatchGames ev={{...ev,gameProtocol:makeProtocol({state:'completed',currentPair:null,completedAt:2,canRecord:false,canFinish:false})}} reload={()=>{}}/>,{me:organizer});
  expect(screen.queryByRole('button',{name:'Внести результат'})).toBeNull();
  expect(screen.getByText('Результаты не записывались')).toBeVisible();
});
test('legacy has no invented zero statistics',()=>{
  renderWithApp(<MatchGames ev={{...ev,gameProtocol:undefined,protocolVersion:0}} reload={()=>{}}/>,{me:player});
  expect(screen.getByRole('heading',{name:'Протокол не велся'})).toBeVisible();
  expect(screen.queryByRole('table')).toBeNull();
});
