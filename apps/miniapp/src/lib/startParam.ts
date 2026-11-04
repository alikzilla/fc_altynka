/** startapp из ссылки в группе → маршрут мини-аппа. */
export function routeForStartParam(p: string | undefined): string {
  switch (p) {
    case 'matches': return '/matches';
    case 'payments': return '/notifications';
    case 'settings': return '/profile';
    case 'newmatch': return '/new';
  }
  const m = p?.match(/^([egbt])(\d+)$/);
  if (!m) return '/';
  const id = Number(m[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return '/';
  if (m[1] === 'g') return `/event/${id}/guest`;
  if (m[1] === 'b') return `/event/${id}?tab=bill`;
  if (m[1] === 't') return `/event/${id}?tab=teams`;
  return `/event/${id}`;
}
