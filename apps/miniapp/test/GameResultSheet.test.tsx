import type { EventDetailDto } from '@altynka/core';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../src/lib/api';
import { GameResultSheet } from '../src/screens/GameResultSheet';
import { organizer, renderWithApp } from './render';
import { makeProtocol } from './gameFixtures';
import { readGameDraft, writeGameDraft } from '../src/lib/gameDraft';

vi.mock('../src/lib/api'); vi.mock('../src/lib/tg');
const ev={id:7} as EventDetailDto;
beforeEach(()=>{ localStorage.clear(); vi.mocked(api.send).mockResolvedValue({}); });
const open=(protocol=makeProtocol())=>renderWithApp(<GameResultSheet ev={ev} protocol={protocol} game={null} onClose={()=>{}} onSaved={vi.fn()} reload={()=>{}}/>,{me:organizer});

test('score controls use actual uniforms while result payload keeps team indices',async()=>{
  renderWithApp(<GameResultSheet ev={{...ev,teams:{teamCount:3,teams:[[1],[2],[3]],colors:['white','green','black'],publishedAt:1,stale:false}}} protocol={makeProtocol()} game={null} onClose={()=>{}} onSaved={()=>{}} reload={()=>{}}/>,{me:organizer});
  await userEvent.click(screen.getByRole('button',{name:'Добавить гол команды Белые'}));
  await userEvent.click(screen.getByRole('button',{name:'Сохранить результат'}));
  expect(api.send).toHaveBeenCalledWith('POST','/api/events/7/games/results',expect.objectContaining({score:[1,0],scorers:[]}));
  expect(screen.queryByRole('button',{name:'Добавить гол команды Красные'})).toBeNull();
});

test('first 0:0 needs sulifa; winning result and scorers are saved together',async()=>{
  open(); const save=screen.getByRole('button',{name:'Сохранить результат'});
  expect(save).toBeDisabled();
  await userEvent.click(screen.getByRole('radio',{name:'Красные'})); expect(save).toBeEnabled();
  await userEvent.click(screen.getByRole('button',{name:'Добавить гол команды Красные'})); await userEvent.click(screen.getByRole('button',{name:'Добавить гол команды Красные'}));
  await userEvent.click(screen.getByRole('button',{name:'Гол 1 команды Красные: выбрать автора'})); await userEvent.click(screen.getByRole('button',{name:'Али'}));
  await userEvent.click(save);
  expect(api.send).toHaveBeenCalledWith('POST','/api/events/7/games/results',expect.objectContaining({score:[2,0],scorers:[{signupId:1,goals:1}],expectedRevision:1}));
  expect(readGameDraft(7,1)).toBeNull();
});

test('multiple guest goals and missing author remain editable after reopening',async()=>{
  const protocol=makeProtocol({currentPair:[0,2],restingTeamIndex:1,games:[{id:'first',sequence:1,pair:[0,1],score:[1,0],scorers:[],firstRestTeamIndex:1,recordedAt:1,recordedBy:1,updatedAt:1,updatedBy:1}]});
  const result=open(protocol);
  expect(screen.queryByRole('radio')).toBeNull();
  for(let i=0;i<3;i++) await userEvent.click(screen.getByRole('button',{name:'Добавить гол команды Жёлтые'}));
  for(const i of [1,3]) { await userEvent.click(screen.getByRole('button',{name:`Гол ${i} команды Жёлтые: выбрать автора`})); await userEvent.click(screen.getByRole('button',{name:'Ерпа'})); }
  expect(screen.getByText('2 из 3 указано')).toBeVisible();
  result.unmount(); open(protocol);
  expect(screen.getByRole('button',{name:'Гол 1 команды Жёлтые: Ерпа'})).toBeVisible(); expect(screen.getByRole('button',{name:'Гол 2 команды Жёлтые: выбрать автора'})).toBeVisible(); expect(screen.getByRole('button',{name:'Гол 3 команды Жёлтые: Ерпа'})).toBeVisible();
  await userEvent.click(screen.getByRole('button',{name:'Сохранить результат'}));
  expect(api.send).toHaveBeenCalledWith('POST',expect.any(String),expect.objectContaining({scorers:[{signupId:3,goals:2}],score:[0,3]}));
});

test('lost response locks the submitted payload and retries exactly the same request',async()=>{
  vi.mocked(api.send).mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce({});
  open(); await userEvent.click(screen.getByRole('button',{name:'Добавить гол команды Красные'}));
  await userEvent.click(screen.getByRole('button',{name:'Сохранить результат'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Повтори');
  expect(screen.getByRole('button',{name:'Добавить гол команды Красные'})).toBeDisabled();
  await userEvent.click(screen.getByRole('button',{name:'Повторить сохранение'}));
  expect(vi.mocked(api.send).mock.calls[0][2]).toEqual(vi.mocked(api.send).mock.calls[1][2]);
});

test('a pending old pair can check its receipt after reload, without transferring the score to the new pair',async()=>{
  writeGameDraft(7,1,{version:1,gameId:null,pair:[0,2],revision:0,requestId:'old-request',input:{score:[3,0],scorers:[]},submitted:true});
  open(); expect(screen.getByText(/другой игры|Данные встречи изменились/)).toBeVisible();
  await userEvent.click(screen.getByRole('button',{name:'Проверить сохранение'}));
  expect(api.send).toHaveBeenCalledWith('POST','/api/events/7/games/results',expect.objectContaining({requestId:'old-request',expectedRevision:0,score:[3,0]}));
});


test('score has no numeric inputs, stops at zero and removes the last goal author',async()=>{
  open();
  expect(screen.queryByRole('spinbutton')).toBeNull();
  expect(screen.getByRole('button',{name:'Убрать гол команды Красные'})).toBeDisabled();
  for(let i=0;i<2;i++) await userEvent.click(screen.getByRole('button',{name:'Добавить гол команды Красные'}));
  await userEvent.click(screen.getByRole('button',{name:'Гол 2 команды Красные: выбрать автора'}));
  expect(screen.queryByRole('button',{name:'Бека'})).toBeNull();
  await userEvent.click(screen.getByRole('button',{name:'Али'}));
  await userEvent.click(screen.getByRole('button',{name:'Убрать гол команды Красные'}));
  expect(screen.getByLabelText('Голы команды Красные')).toHaveTextContent('1');
  expect(screen.queryByRole('button',{name:'Гол 2 команды Красные: Али'})).toBeNull();
  await userEvent.click(screen.getByRole('button',{name:'Сохранить результат'}));
  expect(api.send).toHaveBeenCalledWith('POST',expect.any(String),expect.objectContaining({score:[1,0],scorers:[]}));
});
test('zero-score legacy draft explains excess authors and can repair them without changing the score',async()=>{
  writeGameDraft(7,1,{version:1,gameId:null,pair:[0,1],revision:1,requestId:'legacy',input:{score:[0,0],scorers:[{signupId:1,goals:1}],firstRestTeamIndex:0},submitted:false});
  open();
  expect(screen.getByRole('button',{name:'Сохранить результат'})).toBeDisabled();
  await userEvent.click(screen.getByRole('button',{name:'Убрать лишние авторские голы'}));
  expect(screen.getByLabelText('Голы команды Красные')).toHaveTextContent('0');
  await userEvent.click(screen.getByRole('button',{name:'Сохранить результат'}));
  expect(api.send).toHaveBeenCalledWith('POST',expect.any(String),expect.objectContaining({score:[0,0],scorers:[],requestId:'legacy',firstRestTeamIndex:0}));
});
