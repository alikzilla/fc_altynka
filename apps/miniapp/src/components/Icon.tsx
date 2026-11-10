import { useState, type ReactNode, type SVGProps } from 'react';

const paths = {
  flame: <path d="M13 3c1 5-4 5-2 9-2-1-3-3-3-5-3 3-5 7-3 11a8 8 0 0 0 14-1c2-5-2-10-6-14Z" />,
  trophy: <path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm4 10v7m-4 1h8M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4" />,
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
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  alert: <><path d="m10.3 4-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 3v.1" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" /><path d="M9 8h6m-6 4h6" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="3" /><path d="M16 8V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h2" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

/** `injured` adds the red cross on white in the top-left corner; screen readers hear «травма». */
export function Avatar({ name, large = false, photoUrl, injured = false }: { name: string; large?: boolean; photoUrl?: string | null; injured?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const source = photoUrl?.startsWith('https://') && photoUrl !== failed ? photoUrl : null;
  const avatar = <span className={`avatar${large ? ' avatar-large' : ''}${injured ? ' avatar-injured' : ''}`} aria-hidden="true">{source ? <img src={source} alt="" referrerPolicy="no-referrer" onError={() => setFailed(source)} /> : name.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toLocaleUpperCase('ru')}
    {injured && <span className="avatar-injury" data-testid="injury-badge"><svg viewBox="0 0 12 12"><path d="M4.5 1.5h3v3h3v3h-3v3h-3v-3h-3v-3h3z" /></svg></span>}</span>;
  return injured ? <>{avatar}<span className="sr-only">Травма</span></> : avatar;
}
