import { clearGameDraft, readGameDraft, writeGameDraft, type GameResultDraft } from '../src/lib/gameDraft';

const draft:GameResultDraft={version:1,gameId:null,pair:[0,1],revision:1,requestId:'request',input:{score:[2,0],scorers:[{signupId:1,goals:2}]},submitted:true};
beforeEach(()=>localStorage.clear());
test('draft preserves identity and payload across reload, scoped to user and event',()=>{
  writeGameDraft(7,1,draft); expect(readGameDraft(7,1)).toEqual(draft);
  expect(readGameDraft(8,1)).toBeNull(); expect(readGameDraft(7,2)).toBeNull();
  clearGameDraft(7,1); expect(readGameDraft(7,1)).toBeNull();
});
test('malformed storage and denied storage do not break forms',()=>{
  writeGameDraft(7,1,draft);
  const key=localStorage.key(0)!; localStorage.setItem(key,'broken'); expect(readGameDraft(7,1)).toBeNull();
  localStorage.setItem(key,JSON.stringify({...draft,pair:[0,0]})); expect(readGameDraft(7,1)).toBeNull();
  const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
  expect(()=>writeGameDraft(7,1,draft)).not.toThrow(); spy.mockRestore();
});
test('optional card metadata preserves unknown positions but malformed metadata leaves the retry payload intact',()=>{
  const input={score:[3,0] as [number,number],scorers:[{signupId:1,goals:2}]};
  const goalRuns:[{signupId:number|null;goals:number}[],{signupId:number|null;goals:number}[]]=[[{signupId:1,goals:1},{signupId:null,goals:1},{signupId:1,goals:1}],[]];
  writeGameDraft(7,1,{...draft,input,goalRuns});expect(readGameDraft(7,1)?.goalRuns).toEqual(goalRuns);
  const key=localStorage.key(0)!;localStorage.setItem(key,JSON.stringify({...draft,goalRuns:'broken'}));
  expect(readGameDraft(7,1)).toEqual(draft);
});
test('assist pairs travel with the retry payload; malformed pairs discard the draft',()=>{
  const input={score:[1,0] as [number,number],scorers:[{signupId:1,goals:1}],assists:[{scorerSignupId:1,assistSignupId:4,goals:1}]};
  writeGameDraft(7,1,{...draft,input});expect(readGameDraft(7,1)?.input.assists).toEqual(input.assists);
  writeGameDraft(7,1,{...draft,input:{...input,assists:[{scorerSignupId:1,assistSignupId:-4,goals:1}]}});expect(readGameDraft(7,1)).toBeNull();
});
