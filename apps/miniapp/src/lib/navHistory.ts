/** The list a match was opened from, so «Назад» on the match page returns there instead of always to Матчи. */
let origin = '/matches';
const ORIGINS = /^\/(matches|notifications|players(\/\d+)?|profile)?$/;

export function rememberOrigin(path: string) {
  if (ORIGINS.test(path)) origin = path;
}

export const matchOrigin = () => origin;
