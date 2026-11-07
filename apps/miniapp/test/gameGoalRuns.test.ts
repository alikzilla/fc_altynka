import { authorAt, changeGoalCount, goalRunsFromInput, inputFromGoalRuns, setGoalAuthor, validGoalRuns } from '../src/lib/gameGoalRuns';
import { makeProtocol } from './gameFixtures';

const roster=makeProtocol().roster;
test('aggregate scorers become ordered cards with unknown goals and round-trip without loss',()=>{
  const input={score:[3,1] as [number,number],scorers:[{signupId:1,goals:2}]};
  const runs=goalRunsFromInput(input,[0,1],roster);
  expect([0,1,2].map(i=>authorAt(runs[0],i))).toEqual([1,1,null]);
  expect(authorAt(runs[1],0)).toBeNull();
  expect(inputFromGoalRuns(input,runs)).toEqual(input);
});
test('assigning a later goal preserves unknown positions; removing last goal removes its author',()=>{
  const input={score:[3,0] as [number,number],scorers:[]};
  let runs=goalRunsFromInput(input,[0,1],roster);
  runs=setGoalAuthor(runs,0,2,1);
  expect([0,1,2].map(i=>authorAt(runs[0],i))).toEqual([null,null,1]);
  runs=changeGoalCount(runs,0,-1);
  expect(inputFromGoalRuns(input,runs)).toEqual({score:[2,0],scorers:[]});
});
test('one player can score twice around an unknown goal and changing one author affects only its card',()=>{
  const input={score:[3,0] as [number,number],scorers:[]};
  let runs=goalRunsFromInput(input,[0,1],roster);
  runs=setGoalAuthor(setGoalAuthor(runs,0,0,1),0,2,1);
  expect(inputFromGoalRuns(input,runs).scorers).toEqual([{signupId:1,goals:2}]);
  expect(validGoalRuns(runs,inputFromGoalRuns(input,runs))).toBe(true);
  runs=setGoalAuthor(runs,0,0,null);
  expect([0,1,2].map(i=>authorAt(runs[0],i))).toEqual([null,null,1]);
});
test('large legacy scores stay compact and malformed metadata cannot change a command',()=>{
  const input={score:[Number.MAX_SAFE_INTEGER,0] as [number,number],scorers:[{signupId:1,goals:1000000}]};
  const runs=goalRunsFromInput(input,[0,1],roster);
  expect(runs[0]).toHaveLength(2);
  expect(inputFromGoalRuns(input,runs)).toEqual(input);
  expect(changeGoalCount(runs,0,1)).toEqual(runs);
  expect(validGoalRuns([[{signupId:1,goals:1}],[]],input)).toBe(false);
  expect(validGoalRuns('broken',input)).toBe(false);
});
test('an overassigned old draft keeps its score when its cards are repaired or decremented',()=>{
  const input={score:[1,0] as [number,number],scorers:[{signupId:1,goals:3}]};
  const runs=goalRunsFromInput(input,[0,1],roster);
  expect(inputFromGoalRuns(input,setGoalAuthor(runs,0,0,null))).toEqual({score:[1,0],scorers:[]});
  expect(inputFromGoalRuns(input,changeGoalCount(runs,0,-1))).toEqual({score:[0,0],scorers:[]});
});
