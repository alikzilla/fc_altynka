import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Icon, type IconName } from './Icon';
import { haptic, useBackButton } from '../lib/tg';
import { creatableCommunities, useMe } from '../state/me';

type Tone = 'pearl' | 'plum' | 'blue' | 'coral';
const CLOSE_MS = 160;

/**
 * Меню разделов без места в доке: карточка, которая выскакивает из центральной кнопки и указывает на неё.
 * Создание матча видят только те, кто может его создать. Док остаётся виден под затемнением.
 */
export function MenuSheet({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismiss = useCallback(() => {
    if (timer.current !== undefined) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { onClose(); return; }
    setClosing(true);
    timer.current = setTimeout(onClose, CLOSE_MS);
  }, [onClose]);
  useBackButton(dismiss);
  useEffect(() => {
    const node = dialog.current!;
    const focus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    node.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(timer.current);
      node.close();
      document.body.style.overflow = overflow;
      if (focus?.isConnected) focus.focus();
    };
  }, []);
  const items: [string, string, IconName, Tone][] = [
    ...creatableCommunities(me).length > 0 ? [['/new', 'Создать матч', 'plus', 'pearl'] as [string, string, IconName, Tone]] : [],
    ['/stats', 'Статистика', 'chart', 'plum'], ['/players', 'Игроки', 'people', 'blue'], ['/venues', 'Площадки', 'pin', 'coral'],
  ];
  return <>
    <div className="menu-scrim" data-closing={closing || undefined} aria-hidden="true" />
    {/* Everything outside the card, the dock included, is the dialog's backdrop: a tap there closes the menu. */}
    <dialog ref={dialog} className="menu-pop" data-closing={closing || undefined} aria-labelledby={titleId} aria-modal="true"
      onCancel={e => { e.preventDefault(); dismiss(); }} onClick={e => { if (e.target === e.currentTarget) dismiss(); }}>
      <div className="menu-pop-card">
        <h2 id={titleId} className="sr-only">Меню</h2>
        <nav className="menu-icons" aria-label="Разделы">
          {items.map(([href, label, icon, tone]) => <Link key={href} href={href} className="menu-icon" onClick={() => { haptic('light'); onClose(); }}>
            <span className={`menu-icon-tile menu-${tone}`}><Icon name={icon} /></span><span>{label}</span>
          </Link>)}
        </nav>
      </div>
    </dialog>
  </>;
}
