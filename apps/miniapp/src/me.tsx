import type { MeDto } from '@sbor/core';
import { createContext, useContext } from 'react';

export const MeContext = createContext<MeDto | null>(null);

export function useMe(): MeDto {
  const me = useContext(MeContext);
  if (!me) throw new Error('MeContext missing');
  return me;
}

export const canManage = (me: MeDto) => me.role === 'organizer' || me.role === 'admin';

export const MeReloadContext = createContext<() => void>(() => {});
export const useReloadMe = () => useContext(MeReloadContext);
