/** startapp из ссылки в группе → маршрут мини-аппа. */
export function routeForStartParam(p: string | undefined): string {
  const m = p?.match(/^([egb])(\d+)$/);
  if (!m) return '/';
  const id = m[2];
  if (m[1] === 'g') return `/event/${id}/guest`;
  if (m[1] === 'b') return `/event/${id}?tab=bill`;
  return `/event/${id}`;
}
