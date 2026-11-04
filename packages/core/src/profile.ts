export const PLAYING_POSITIONS = ['goalkeeper', 'defender', 'midfielder', 'forward', 'universal'] as const;
export type PlayingPosition = typeof PLAYING_POSITIONS[number];
export const DOMINANT_FEET = ['right', 'left', 'both'] as const;
export type DominantFoot = typeof DOMINANT_FEET[number];
export const APP_THEMES = ['dark', 'light'] as const;
export type AppTheme = typeof APP_THEMES[number];

export const playingPositionLabel: Record<PlayingPosition, string> = {
  goalkeeper: 'Вратарь', defender: 'Защитник', midfielder: 'Полузащитник', forward: 'Нападающий', universal: 'Универсал',
};
export const dominantFootLabel: Record<DominantFoot, string> = { right: 'Правая', left: 'Левая', both: 'Обе' };
