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
  expect(screen.getByRole('link',{name:'Открыть игру'})).toHaveAttribute('href','/event/7/game');
  expect(screen.getByRole('heading',{name:'Бомбардиры'})).toBeVisible();
});
test('organizer can record, and completed meetings keep edits but no new result',()=>{
  const result=renderWithApp(<MatchGames ev={{...ev,viewerRole:'organizer',gameProtocol:makeProtocol()}} reload={()=>{}}/>,{me:organizer});
  expect(screen.getByRole('link',{name:'Открыть игру'})).toHaveAttribute('href','/event/7/game');
  expect(screen.getAllByRole('link',{name:'Открыть игру'})).toHaveLength(1);
  expect(screen.queryByRole('button',{name:'Внести результат'})).toBeNull(); result.unmount();
  renderWithApp(<MatchGames ev={{...ev,gameProtocol:makeProtocol({state:'completed',currentPair:null,completedAt:2,canRecord:false,canFinish:false})}} reload={()=>{}}/>,{me:organizer});
  expect(screen.queryByRole('link',{name:'Открыть игру'})).toBeNull();
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

test('the leaders card switches between scorers and assistants',async()=>{
  const roster=[{signupId:1,userId:1,name:'Али',teamIndex:0},{signupId:4,userId:4,name:'Дамир',teamIndex:0},{signupId:2,userId:2,name:'Бека',teamIndex:1},{signupId:3,userId:null,name:'Ерпа',teamIndex:2}];
  const games=[{id:'g1',sequence:1,pair:[0,1] as [number,number],score:[2,0] as [number,number],scorers:[{signupId:1,goals:2}],assists:[{scorerSignupId:1,assistSignupId:4,goals:2}],firstRestTeamIndex:1,recordedAt:1,recordedBy:1,updatedAt:1,updatedBy:1}];
  renderWithApp(<MatchGames ev={{...ev,gameProtocol:makeProtocol({roster,games,canRecord:false,canEdit:false,canFinish:false})}} reload={()=>{}}/>,{me:player});
  const card=screen.getByRole('region',{name:'Бомбардиры'});
  expect(within(card).getByRole('button',{name:'Голы'})).toHaveAttribute('aria-pressed','true');
  expect(within(card).getByRole('listitem')).toHaveTextContent(/Али.*2/);
  await userEvent.click(within(card).getByRole('button',{name:'Пасы'}));
  const assists=screen.getByRole('region',{name:'Ассистенты'});
  expect(within(assists).getByRole('button',{name:'Пасы'})).toHaveAttribute('aria-pressed','true');
  expect(within(assists).getAllByRole('listitem')).toHaveLength(1);
  expect(within(assists).getByRole('listitem')).toHaveTextContent(/Дамир.*2/);
});
test('assistants explain when no pass is marked yet',async()=>{
  renderWithApp(<MatchGames ev={ev} reload={()=>{}}/>,{me:player});
  await userEvent.click(screen.getByRole('button',{name:'Пасы'}));
  expect(screen.getByText('Пасы пока не указаны.')).toBeVisible();
});

describe('live mark on the current game',()=>{
  const timer={gameSequence:1,durationSec:360,startedAt:1000,pausedAt:null as number|null,pausedMs:0,updatedAt:1000};
  test('pulses while the game clock runs, without showing the time',()=>{
    renderWithApp(<MatchGames ev={{...ev,gameProtocol:makeProtocol({timer})}} reload={()=>{}}/>,{me:player});
    const current=screen.getByRole('region',{name:'Текущая игра'});
    expect(within(current).getByRole('img',{name:'Игра идёт'})).toBeInTheDocument();
    expect(current).not.toHaveTextContent(/\d:\d\d/);
  });
  test('is absent before the start and during a pause',()=>{
    const first=renderWithApp(<MatchGames ev={{...ev,gameProtocol:makeProtocol({timer:null})}} reload={()=>{}}/>,{me:player});
    expect(screen.queryByRole('img',{name:'Игра идёт'})).toBeNull();
    first.unmount();
    renderWithApp(<MatchGames ev={{...ev,gameProtocol:makeProtocol({timer:{...timer,pausedAt:2000}})}} reload={()=>{}}/>,{me:player});
    expect(screen.queryByRole('img',{name:'Игра идёт'})).toBeNull();
  });
});

test('goals without an author read as a count, and the goal difference sits on the goals line', () => {
  const unknown={id:'g1',sequence:1,pair:[0,1] as [number,number],score:[2,0] as [number,number],scorers:[],firstRestTeamIndex:1,recordedAt:1,recordedBy:1,updatedAt:1,updatedBy:1};
  renderWithApp(<MatchGames ev={{...ev,gameProtocol:makeProtocol({games:[unknown]})}} reload={()=>{}}/>,{me:player});
  expect(screen.getByText('2 гола без автора')).toBeInTheDocument();
  expect(screen.queryByText(/автор не указан/)).toBeNull();
  expect(screen.getByRole('table',{name:'Таблица команд'})).toHaveTextContent('2:0+2');
});

test('a finished match stands the teams on a podium and adds the viewer\'s own line',()=>{
  const roster=[{signupId:1,userId:player.userId,name:'Я',teamIndex:2},{signupId:2,userId:3,name:'Бека',teamIndex:0},{signupId:3,userId:4,name:'Ерпа',teamIndex:1}];
  const g=(id:string,sequence:number,pair:[number,number],score:[number,number],scorers:{signupId:number;goals:number}[]=[])=>({id,sequence,pair,score,scorers,firstRestTeamIndex:null,recordedAt:1,recordedBy:1,updatedAt:1,updatedBy:1});
  const games=[g('g1',1,[0,2],[2,1],[{signupId:1,goals:1}]),g('g2',2,[0,1],[1,0]),g('g3',3,[1,2],[0,0])];
  const standings=[{teamIndex:0,rank:1,played:2,wins:2,draws:0,losses:0,goalsFor:3,goalsAgainst:1,goalDifference:2,points:6},{teamIndex:1,rank:2,played:2,wins:0,draws:1,losses:1,goalsFor:0,goalsAgainst:1,goalDifference:-1,points:1},{teamIndex:2,rank:2,played:2,wins:0,draws:1,losses:1,goalsFor:1,goalsAgainst:2,goalDifference:-1,points:1}];
  renderWithApp(<MatchGames ev={{...ev,gameProtocol:makeProtocol({state:'completed',roster,games,standings,currentPair:null,restingTeamIndex:null})}} reload={()=>{}}/>,{me:player});
  const podium=screen.getByRole('region',{name:'Итоги матча'});
  expect(within(podium).getByText('3 игры')).toBeInTheDocument();
  expect(within(podium).getAllByRole('listitem').map(li=>li.getAttribute('aria-label'))).toEqual(['2 место: Жёлтые, 1 очко','1 место: Красные, 6 очков','3 место: Синие, 1 очко']);
  expect(podium).toHaveTextContent('Ты за Жёлтых · 0–1–1 · 1 гол');
});


test('the 3/1/0 rule opens from the «i» in the table card corner and closes on a tap elsewhere',async()=>{
  renderWithApp(<MatchGames ev={ev} reload={()=>{}}/>,{me:player});
  const table=screen.getByRole('region',{name:'Таблица'});
  expect(within(table).queryByText(/Победа — 3 очка/)).toBeNull();
  const info=within(table).getByRole('button',{name:'Как считаются очки'});
  await userEvent.click(info);
  expect(info).toHaveAttribute('aria-expanded','true');
  expect(within(table).getByRole('status')).toHaveTextContent('Победа — 3 очка, ничья — 1');
  await userEvent.click(document.body);
  expect(within(table).queryByRole('status')).toBeNull();
});

test('a game in the history reads score, then scorers at the edges with «Игра N» between; an editor taps the game to edit',async()=>{
  const games=[{id:'g1',sequence:1,pair:[0,1] as [number,number],score:[0,0] as [number,number],scorers:[],firstRestTeamIndex:1,recordedAt:1,recordedBy:1,updatedAt:1,updatedBy:1}];
  renderWithApp(<MatchGames ev={{...ev,gameProtocol:makeProtocol({games,canEdit:true})}} reload={()=>{}}/>,{me:organizer});
  const history=screen.getByRole('region',{name:'Последние игры'});
  const item=within(history).getAllByRole('listitem').find(li=>li.classList.contains('game-result'))!;
  expect(item).toHaveTextContent('0:0');
  expect(item).toHaveTextContent('Игра 1');
  expect(item).not.toHaveTextContent('—');
  expect(within(item).getByRole('button',{name:'Изменить результат игры 1'})).toBeEmptyDOMElement();
});

test('with three games or fewer the card already shows them all, so there is no «Все» link',()=>{
  const games=Array.from({length:3},(_,i)=>({id:`game-${i+1}`,sequence:i+1,pair:[0,1] as [number,number],score:[1,0] as [number,number],scorers:[],firstRestTeamIndex:1,recordedAt:1,recordedBy:1,updatedAt:1,updatedBy:1}));
  renderWithApp(<MatchGames ev={{...ev,gameProtocol:makeProtocol({games})}} reload={()=>{}}/>,{me:player});
  expect(screen.queryByRole('button',{name:/Все игры/})).toBeNull();
});

