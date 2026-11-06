import type { MeDto } from '@altynka/core';
import { createContext, useContext } from 'react';

export const MeContext = createContext<MeDto | null>(null);

export function useMe(): MeDto {
  const me = useContext(MeContext);
  if (!me) throw new Error('MeContext missing');
  return me;
}

export const creatableCommunities = (me: MeDto) => me.communities.filter(c => c.role !== 'player');
export const showGroups = (me: MeDto) => me.communities.length > 1;

export const MeReloadContext = createContext<() => void>(() => {});
export const useReloadMe = () => useContext(MeReloadContext);
export const MeUpdateContext = createContext<(me: MeDto | ((current: MeDto) => MeDto)) => void>(() => {});
export const useUpdateMe = () => useContext(MeUpdateContext);
