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

test('first 0:0 needs sulifa; winning result and scorers are saved together',async()=>{
  open(); const save=screen.getByRole('button',{name:'Сохранить результат'});
  expect(save).toBeDisabled();
  await userEvent.click(screen.getByRole('radio',{name:'Красные'})); expect(save).toBeEnabled();
  await userEvent.clear(screen.getByLabelText('Голы команды Красные')); await userEvent.type(screen.getByLabelText('Голы команды Красные'),'2');
  await userEvent.click(screen.getByRole('button',{name:'Добавить гол: Али'}));
  await userEvent.click(save);
  expect(api.send).toHaveBeenCalledWith('POST','/api/events/7/games/results',expect.objectContaining({score:[2,0],scorers:[{signupId:1,goals:1}],expectedRevision:1}));
  expect(readGameDraft(7,1)).toBeNull();
});

test('multiple guest goals and missing author remain editable after reopening',async()=>{
  const protocol=makeProtocol({currentPair:[0,2],restingTeamIndex:1,games:[{id:'first',sequence:1,pair:[0,1],score:[1,0],scorers:[],firstRestTeamIndex:1,recordedAt:1,recordedBy:1,updatedAt:1,updatedBy:1}]});
  const result=open(protocol);
  expect(screen.queryByRole('radio')).toBeNull();
  await userEvent.clear(screen.getByLabelText('Голы команды Жёлтые')); await userEvent.type(screen.getByLabelText('Голы команды Жёлтые'),'3');
  await userEvent.click(screen.getByRole('button',{name:'Добавить гол: Ерпа'})); await userEvent.click(screen.getByRole('button',{name:'Добавить гол: Ерпа'}));
  expect(screen.getByText('Автор не указан: 1')).toBeVisible();
  result.unmount(); open(protocol);
  expect(screen.getByLabelText('Голы: Ерпа')).toHaveValue(2);
  await userEvent.click(screen.getByRole('button',{name:'Сохранить результат'}));
  expect(api.send).toHaveBeenCalledWith('POST',expect.any(String),expect.objectContaining({scorers:[{signupId:3,goals:2}],score:[0,3]}));
});

test('lost response locks the submitted payload and retries exactly the same request',async()=>{
  vi.mocked(api.send).mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce({});
  open(); await userEvent.type(screen.getByLabelText('Голы команды Красные'),'1');
  await userEvent.click(screen.getByRole('button',{name:'Сохранить результат'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Повтори');
  expect(screen.getByLabelText('Голы команды Красные')).toBeDisabled();
  await userEvent.click(screen.getByRole('button',{name:'Повторить сохранение'}));
  expect(vi.mocked(api.send).mock.calls[0][2]).toEqual(vi.mocked(api.send).mock.calls[1][2]);
});

test('a pending old pair can check its receipt after reload, without transferring the score to the new pair',async()=>{
  writeGameDraft(7,1,{version:1,gameId:null,pair:[0,2],revision:0,requestId:'old-request',input:{score:[3,0],scorers:[]},submitted:true});
  open(); expect(screen.getByText(/другой игры|Данные встречи изменились/)).toBeVisible();
  await userEvent.click(screen.getByRole('button',{name:'Проверить сохранение'}));
  expect(api.send).toHaveBeenCalledWith('POST','/api/events/7/games/results',expect.objectContaining({requestId:'old-request',expectedRevision:0,score:[3,0]}));
});
