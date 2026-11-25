import { useSyncExternalStore } from 'react';
import { clubById, type AppTheme, type ClubId } from '@altynka/core';
import { clubVariables } from './clubTheme';

const CACHE_KEY = 'altynka:theme';
const CLUB_CACHE_KEY = 'altynka:club';
const CLUB_VARIABLES = ['--accent', '--accent-ink', '--on-accent', '--accent-soft', '--club-accent', '--club-on-accent', '--club-pattern'];

export function getTheme(): AppTheme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function getClubId(): ClubId | null {
  return clubById(document.documentElement.dataset.club)?.id ?? null;
}

/** Выставляет или убирает клубные переменные на <html>; тема должна быть уже выставлена. */
function paintClub(id: ClubId | null): void {
  const root = document.documentElement;
  const club = clubById(id);
  for (const name of CLUB_VARIABLES) root.style.removeProperty(name);
  if (!club) {
    delete root.dataset.club;
    return;
  }
  root.dataset.club = club.id;
  for (const [name, value] of Object.entries(clubVariables(club, getTheme()))) root.style.setProperty(name, value);
}

export function applyClub(id: ClubId | null): void {
  const club = clubById(id);
  paintClub(club?.id ?? null);
  try {
    if (club) localStorage.setItem(CLUB_CACHE_KEY, club.id);
    else localStorage.removeItem(CLUB_CACHE_KEY);
  } catch {
    // Storage may be disabled; the club still applies for this session.
  }
  window.dispatchEvent(new Event('altynka:theme'));
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  paintClub(getClubId());
  try {
    localStorage.setItem(CACHE_KEY, theme);
  } catch {
    // Telegram/browser privacy settings can disable storage; the active choice still applies.
  }
  window.dispatchEvent(new Event('altynka:theme'));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('altynka:theme', onChange);
  return () => window.removeEventListener('altynka:theme', onChange);
}

export function useClubId(): ClubId | null {
  return useSyncExternalStore(subscribe, getClubId, () => null);
}

export function initializeTheme(): void {
  let cached: string | null = null;
  try {
    cached = localStorage.getItem(CACHE_KEY);
  } catch {
    // Account data can hydrate the preference after the first render.
  }
  let club: string | null = null;
  try {
    club = localStorage.getItem(CLUB_CACHE_KEY);
  } catch {
    // Without storage the club arrives with the account.
  }
  const id = clubById(club)?.id ?? null;
  if (id) document.documentElement.dataset.club = id;
  applyTheme(cached === 'light' ? 'light' : 'dark');
}
