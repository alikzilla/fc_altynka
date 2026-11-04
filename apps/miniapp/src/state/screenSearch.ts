import { createContext, useContext } from 'react';
import { useSearch } from 'wouter';

/** Keep the underlying screen's query while /new owns the actual URL. */
export const ScreenSearchContext = createContext<string | undefined>(undefined);
export function useScreenSearch() {
  const actual = useSearch();
  return useContext(ScreenSearchContext) ?? actual;
}
