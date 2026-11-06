import type { MeDto } from '@altynka/core';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { MeContext } from '../src/state/me';
import { ToastProvider } from '../src/components/ui';

export const player: MeDto = { userId: 2, displayName: 'Игрок', kaspiPhone: null, communities: [{ id: 1, title: 'FC Altynka', role: 'player' }] };
export const organizer: MeDto = { userId: 1, displayName: 'Орг', kaspiPhone: '+77071234567', communities: [{ id: 1, title: 'FC Altynka', role: 'organizer' }] };
export const admin: MeDto = { userId: 9, displayName: 'Админ', kaspiPhone: null, communities: [{ id: 1, title: 'FC Altynka', role: 'admin' }] };

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
