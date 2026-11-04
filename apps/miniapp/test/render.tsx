import type { MeDto } from '@altynka/core';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { MeContext } from '../src/state/me';
import { ToastProvider } from '../src/components/ui';

export const player: MeDto = { userId: 2, displayName: 'Игрок', role: 'player', kaspiPhone: null };
export const organizer: MeDto = { userId: 1, displayName: 'Орг', role: 'organizer', kaspiPhone: '+77071234567' };
export const admin: MeDto = { userId: 9, displayName: 'Админ', role: 'admin', kaspiPhone: null };

export function renderWithApp(ui: ReactElement, o: { me: MeDto; path?: string }) {
  const loc = memoryLocation({ path: o.path ?? '/', record: true });
  const result = render(
    <Router hook={loc.hook} searchHook={loc.searchHook}>
      <MeContext.Provider value={o.me}>
        <ToastProvider>{ui}</ToastProvider>
      </MeContext.Provider>
    </Router>,
  );
  return { ...result, history: loc.history! };
}
