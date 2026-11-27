import { useState, type ReactNode, type SVGProps } from 'react';

const paths = {
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.2a4 4 0 0 0 7 0M9 9.6h.01M15 9.6h.01" /></>,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3.5Z" />,
  flame: <path d="M13 3c1 5-4 5-2 9-2-1-3-3-3-5-3 3-5 7-3 11a8 8 0 0 0 14-1c2-5-2-10-6-14Z" />,
  crown: <path d="M3.5 8.5 7.5 12 12 5l4.5 7 4-3.5-1.8 10H5.3L3.5 8.5Z" />,
  trophy: <path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm4 10v7m-4 1h8M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4" />,
  medal: <><path d="M8 3 5 9m11-6 3 6M9 3h6l2 5H7l2-5Z" /><circle cx="12" cy="15" r="6" /><path d="m12 12.5.9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3.9-1.8Z" /></>,
  target: <><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="m12 12 8-8m-3 0h3v3"/></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
  swap: <path d="M4 7h14m-4-4 4 4-4 4M20 17H6m4-4-4 4 4 4" />,
  shuffle: <path d="M3 4h3l12 16h3m-4-4 4 4-4 3M3 20h3L18 4h3m-4-3 4 3-4 4" />,
  undo: <path d="m8 4-5 5 5 5M3 9h10a6 6 0 0 1 0 12" />,
  shirt: <path d="m8 3-5 3-2 5 4 2 2-3v11h10V10l2 3 4-2-2-5-5-3c0 4-8 4-8 0Z" />,
  home: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  ball: <><circle cx="12" cy="12" r="9" /><path d="m12 7 4.8 3.5-1.8 5.6H9l-1.8-5.6L12 7Zm0 0V3m4.8 7.5 3.7-1.2M15 16.1l2.3 3.1M9 16.1l-2.3 3.1M7.2 10.5 3.5 9.3" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  settings: <><path d="m9.5 3-.6 2.2-1.7 1-2.2-.6-2.5 4.3 1.6 1.6v2L2.5 15 5 19.3l2.2-.6 1.7 1 .6 2.3h5l.6-2.3 1.7-1 2.2.6 2.5-4.3-1.6-1.5v-2l1.6-1.6L19 5.6l-2.2.6-1.7-1L14.5 3h-5Z" /><circle cx="12" cy="12.5" r="3" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  back: <path d="m14 6-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  /* Меню разделов: девять точек; «Главная» уже занята четырьмя плитками. */
  grid: <path d="M5 5h.01M12 5h.01M19 5h.01M5 12h.01M12 12h.01M19 12h.01M5 19h.01M12 19h.01M19 19h.01" strokeWidth="3.2" />,
  chart: <path d="M5 20v-8m7 8V4m7 16v-5" />,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  offline: <path d="M2 8.8a15.5 15.5 0 0 1 4.6-2.9M10.5 5a15.5 15.5 0 0 1 11.5 3.8M5.3 12.4a10.5 10.5 0 0 1 3.9-2.2M15 10.5a10.5 10.5 0 0 1 3.7 1.9M8.6 15.9a5.5 5.5 0 0 1 6.8 0M12 19.5h.01M3 3l18 18" />,
  check: <path d="m5 12 4 4L19 6" />,
  alert: <><path d="m10.3 4-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 3v.1" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" /><path d="M9 8h6m-6 4h6" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  share: <path d="M12 15V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />,
  play: <path d="M8 5.6v12.8a1 1 0 0 0 1.53.85l10.2-6.4a1 1 0 0 0 0-1.7L9.53 4.75A1 1 0 0 0 8 5.6Z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6.2" y="5" width="4" height="14" rx="1.3" fill="currentColor" stroke="none" /><rect x="13.8" y="5" width="4" height="14" rx="1.3" fill="currentColor" stroke="none" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  trash: <path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />,
  chat: <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12Z" />,
  external: <path d="M14 4h6v6m0-6-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />,
  copy: <><rect x="8" y="8" width="12" height="13" rx="3" /><path d="M16 8V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h2" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

/** `injured` adds the red cross on white in the top-left corner; screen readers hear «травма». */
export function Avatar({ name, large = false, photoUrl, injured = false, crowned = false }: { name: string; large?: boolean; photoUrl?: string | null; injured?: boolean; crowned?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const source = photoUrl?.startsWith('https://') && photoUrl !== failed ? photoUrl : null;
  const avatar = <span className={`avatar${large ? ' avatar-large' : ''}${injured ? ' avatar-injured' : ''}${crowned ? ' avatar-crowned' : ''}`} aria-hidden="true">{source ? <img src={source} alt="" referrerPolicy="no-referrer" onError={() => setFailed(source)} /> : name.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toLocaleUpperCase('ru')}
    {injured && <span className="avatar-injury" data-testid="injury-badge"><svg viewBox="0 0 12 12"><path d="M4.5 1.5h3v3h3v3h-3v3h-3v-3h-3v-3h3z" /></svg></span>}
    {crowned && <span className="avatar-crown" data-testid="crown-badge"><svg viewBox="0 0 24 24">{paths.crown}</svg></span>}</span>;
  return injured || crowned ? <>{avatar}{injured && <span className="sr-only">Травма</span>}{crowned && <span className="sr-only">Действующий MVP</span>}</> : avatar;
}
