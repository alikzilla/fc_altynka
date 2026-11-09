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
  const history=screen.getByRole('region',{name:'Последние игры'});
  expect(within(history).getAllByRole('listitem').filter(li=>li.classList.contains('game-result')).map(li=>li.textContent)).toEqual([expect.stringContaining('Игра 5'),expect.stringContaining('Игра 4'),expect.stringContaining('Игра 3')]);
  expect(within(history).queryByText('Игра 1')).toBeNull();
  await userEvent.click(screen.getByRole('button',{name:'Все игры (5)'}));
  const sheet=screen.getByRole('dialog',{name:'Все игры'});
  expect(within(sheet).getAllByRole('listitem').filter(li=>li.classList.contains('game-result'))).toHaveLength(5);
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
  await userEvent.click(screen.getByRole('button',{name:'Завершить матч'}));
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

describe('redesigned games tab',()=>{
  const roster=[{signupId:1,userId:1,name:'Али',teamIndex:0},{signupId:4,userId:4,name:'Дамир',teamIndex:0},{signupId:2,userId:2,name:'Бека',teamIndex:1},{signupId:3,userId:null,name:'Ерпа',teamIndex:2}];
  const played={id:'g1',sequence:1,pair:[0,1] as [number,number],score:[2,0] as [number,number],scorers:[{signupId:1,goals:2}],assists:[{scorerSignupId:1,assistSignupId:4,goals:1}],firstRestTeamIndex:1,recordedAt:1,recordedBy:1,updatedAt:1,updatedBy:1};
  test('current game shows the pair with points so far and no six-minute hint',()=>{
    renderWithApp(<MatchGames ev={{...ev,gameProtocol:makeProtocol({roster,games:[played],currentPair:[0,2],restingTeamIndex:1})}} reload={()=>{}}/>,{me:player});
    const current=screen.getByRole('region',{name:'Текущая игра'});
    expect(current).toHaveTextContent('Игра 2');
    expect(current).not.toHaveTextContent('6 минут');
    expect(within(current).getByText('3 очка')).toBeVisible();
    expect(within(current).getByText('0 очков')).toBeVisible();
    expect(current).toHaveTextContent('Отдыхают Синие');
  });
  test('scorers sit under their own team with the assister in brackets and a dash for no goals',()=>{
    renderWithApp(<MatchGames ev={{...ev,gameProtocol:makeProtocol({roster,games:[played],currentPair:[0,2],restingTeamIndex:1})}} reload={()=>{}}/>,{me:player});
    const history=screen.getByRole('region',{name:'Последние игры'});
    const [left,right]=within(history).getAllByRole('list',{name:/Голы/});
    expect(left).toHaveAccessibleName('Голы: Красные');
    expect(within(left).getAllByRole('listitem').map(li=>li.textContent)).toEqual(['Али (Дамир)','Али']);
    expect(right).toHaveTextContent('—');
  });
  test('two-team first game names the kickoff team',()=>{
    renderWithApp(<MatchGames ev={{...ev,gameProtocol:makeProtocol({teamCount:2,roster:roster.slice(0,3),currentPair:[0,1],restingTeamIndex:null,kickoffTeamIndex:1})}} reload={()=>{}}/>,{me:player});
    expect(screen.getByRole('region',{name:'Текущая игра'})).toHaveTextContent('С мячом начинают Синие');
  });
});
