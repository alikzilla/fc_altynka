import type { EventDetailDto } from '@altynka/core';
import { screen, within } from '@testing-library/react';
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../src/lib/api';
import { MatchGames } from '../src/screens/MatchGames';
import { organizer, player, renderWithApp } from './render';
import { makeProtocol } from './gameFixtures';

test('latest three results are newest first and all games open in a sheet with edit permissions',async()=>{
  const games=Array.from({length:5},(_,i)=>({id:`game-${i+1}`,sequence:i+1,pair:[0,1] as [number,number],score:[1,0] as [number,number],scorers:[],firstRestTeamIndex:1,recordedAt:1,recordedBy:1,updatedAt:1,updatedBy:1}));
  renderWithApp(<MatchGames ev={{...ev,gameProtocol:makeProtocol({games,canEdit:false})}} reload={()=>{}}/>,{me:player});
  const history=screen.getByRole('region',{name:'Последние матчи'});
  expect(within(history).getAllByRole('listitem').map(li=>li.textContent)).toEqual([expect.stringContaining('Игра 5'),expect.stringContaining('Игра 4'),expect.stringContaining('Игра 3')]);
  expect(within(history).queryByText('Игра 1')).toBeNull();
  await userEvent.click(screen.getByRole('button',{name:'Все матчи (5)'}));
  const sheet=screen.getByRole('dialog',{name:'Все матчи'});
  expect(within(sheet).getAllByRole('listitem')).toHaveLength(5);
  expect(within(sheet).queryByRole('button',{name:/Изменить результат/})).toBeNull();
});

vi.mock('../src/lib/api'); vi.mock('../src/lib/tg');
const ev={id:7,protocolVersion:1,viewerRole:'player',community:{id:1,title:'FC Altynka'},gameProtocol:makeProtocol({canRecord:false,canEdit:false,canFinish:false})} as EventDetailDto;
test('actual kit colors label the current pair, rest and standings without changing statistics',()=>{
  renderWithApp(<MatchGames ev={{...ev,teams:{teamCount:3,teams:[[1],[2],[3]],colors:['white','green','black'],publishedAt:1,stale:false}}} reload={()=>{}}/>,{me:player});
  expect(screen.getByText(/Отдыхают/)).toHaveTextContent('Чёрные');
  const table=screen.getByRole('table',{name:'Таблица команд'});
  expect(within(table).getByText('Белые')).toBeVisible();
  expect(within(table).getByText('Зелёные')).toBeVisible();
  expect(within(table).queryByText('Красные')).toBeNull();
});
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

test('ambiguous finish freezes participants and preserves its command across closing and reopening',async()=>{
  vi.mocked(api.send).mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({});
  renderWithApp(<MatchGames ev={{...ev,viewerRole:'organizer',gameProtocol:makeProtocol()}} reload={()=>{}}/>,{me:organizer});
  await userEvent.click(screen.getByRole('button',{name:'Действия'}));
  await userEvent.click(screen.getByRole('button',{name:'Завершить встречу'}));
  await userEvent.click(screen.getByRole('button',{name:'Подтвердить завершение'}));
  expect(await screen.findByRole('alert')).toHaveTextContent(/завершение/);
  for(const checkbox of screen.getAllByRole('checkbox'))expect(checkbox).toBeDisabled();
  await userEvent.click(screen.getByRole('button',{name:'Закрыть'}));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,220));});
  await userEvent.click(screen.getByRole('button',{name:'Действия'}));
  expect(screen.queryByRole('button',{name:'Отменить последнюю запись'})).toBeNull();
  await userEvent.click(screen.getByRole('button',{name:'Проверить завершение'}));
  await userEvent.click(screen.getByRole('button',{name:'Повторить завершение'}));
  expect(vi.mocked(api.send).mock.calls.at(-1)?.[2]).toEqual(vi.mocked(api.send).mock.calls.at(-2)?.[2]);
});
