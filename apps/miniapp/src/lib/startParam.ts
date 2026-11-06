/** startapp из ссылки в группе → маршрут мини-аппа. */
export function routeForStartParam(p: string | undefined): string {
  const team = /^c([1-9]\d*)_(matches|payments|settings|newmatch)$/.exec(p ?? '');
  if (team) {
    if (!Number.isSafeInteger(Number(team[1]))) return '/';
    p = team[2];
  }
  switch (p) {
    case 'matches': return '/matches';
    case 'payments': return '/notifications';
    case 'settings': return '/profile';
    case 'newmatch': return '/new';
  }
  const m = p?.match(/^([egbtr])(\d+)$/);
  if (!m) return '/';
  const id = Number(m[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return '/';
  if (m[1] === 'g') return `/event/${id}/guest`;
  if (m[1] === 'b') return `/event/${id}?tab=bill`;
  if (m[1] === 't') return `/event/${id}?tab=teams`;
  if (m[1] === 'r') return `/event/${id}/review`;
  return `/event/${id}`;
}

export function contextForStartParam(p: string | undefined): { joinCommunityId?: number; route: string } {
  const route = routeForStartParam(p);
  const team = /^c([1-9]\d*)_(matches|payments|settings|newmatch)$/.exec(p ?? '');
  return team && route !== '/' ? { joinCommunityId: Number(team[1]), route } : { route };
}
