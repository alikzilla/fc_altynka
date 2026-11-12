import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Icon, type IconName } from './Icon';
import { MenuSheet } from './MenuSheet';
import { useNotifications } from '../state/notifications';
import { haptic } from '../lib/tg';

const ITEMS: [string, string, IconName][] = [
  ['/', 'Главная', 'home'], ['/matches', 'Матчи', 'calendar'],
  ['/notifications', 'Задачи', 'bell'], ['/profile', 'Профиль', 'user'],
];

export function Nav() {
  const [path] = useLocation();
  const { data, error } = useNotifications();
  const [menu, setMenu] = useState(false);
  const active = (href: string) => href === '/' ? path === '/' : href === '/profile' ? path === '/profile' || path.startsWith('/profile/') || path === '/players' || path.startsWith('/players/') : path === href;
  const link = ([href, label, icon]: [string, string, IconName]) => (
    <Link key={href} href={href} className={active(href) ? 'on' : ''} aria-label={label} aria-current={active(href) ? 'page' : undefined} onClick={() => haptic('light')}>
      <span className="nav-icon"><Icon name={icon} />{href === '/notifications' && !error && !!data?.tasks.length && <i className="nav-dot" aria-hidden="true" />}</span>
      <span>{label}</span>
    </Link>
  );
  return (
    <div className="nav-shell">
      <nav className="nav" aria-label="Основная навигация">
        {ITEMS.slice(0, 2).map(link)}
        {/* The centre control is the same for everyone: it opens the menu of sections that have no dock slot. */}
        <button type="button" className="nav-create" aria-label="Меню" aria-haspopup="dialog" aria-expanded={menu} onClick={() => { haptic('light'); setMenu(true); }}>
          <span className="nav-icon"><Icon name="grid" className="nav-menu-dots" /><Icon name="close" className="nav-menu-close" /></span>
        </button>
        {ITEMS.slice(2).map(link)}
      </nav>
      {menu && <MenuSheet onClose={() => setMenu(false)} />}
    </div>
  );
}
