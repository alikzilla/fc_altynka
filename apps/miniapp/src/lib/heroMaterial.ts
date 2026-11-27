import { clubById } from '@altynka/core';
import type { CSSProperties } from 'react';
import { materialVariables } from './clubTheme';
import { getClubId, useClubId } from './theme';

type Fallback = 'material-plum' | 'material-blue';
export interface HeroMaterial { className: string; style: CSSProperties | undefined }

function heroFor(id: ReturnType<typeof getClubId>, fallback: Fallback): HeroMaterial {
  const club = clubById(id);
  return club ? { className: 'club-material club-hero', style: materialVariables(club) as CSSProperties } : { className: fallback, style: undefined };
}

/**
 * The main card of a screen (the next match, the match card, the current pair, the podium) wears the favourite
 * club's material; without a club it keeps its own plum or blue. Payments and tasks stay coral and blue.
 */
export function useHeroMaterial(fallback: Fallback): HeroMaterial {
  return heroFor(useClubId(), fallback);
}

/** The same for skeletons, which render before the account and read the cached club. */
export function heroMaterialNow(fallback: Fallback): HeroMaterial {
  return heroFor(getClubId(), fallback);
}
