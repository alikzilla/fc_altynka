import { calculateScorers, calculateStandings, type GameProtocolDto } from '@altynka/core';

export function makeProtocol(overrides: Partial<GameProtocolDto> = {}): GameProtocolDto {
  const base: GameProtocolDto = {
    state:'playing',revision:1,startedAt:1794139200000,completedAt:null,teamCount:3,
    roster:[{signupId:1,userId:1,name:'Али',teamIndex:0},{signupId:2,userId:2,name:'Бека',teamIndex:1},{signupId:3,userId:null,name:'Ерпа',teamIndex:2}],
    currentPair:[0,1],restingTeamIndex:2,games:[],standings:[],scorers:[],
    canStart:false,canRecord:true,canEdit:true,canUndo:false,canFinish:true,...overrides,
  };
  base.standings=calculateStandings(base.teamCount ?? 3,base.games);
  base.scorers=calculateScorers(base.roster,base.games);
  return base;
}
