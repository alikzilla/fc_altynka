import { Link, useLocation } from 'wouter';
import { canManage, useMe } from '../state/me';
import { Icon, type IconName } from './Icon';
import { useNotifications } from '../state/notifications';
import { haptic } from '../lib/tg';

export function Nav() {
  const me = useMe();
  const [path] = useLocation();
  const { data, error } = useNotifications();
  const items: [string, string, IconName][] = [
    ['/', 'Главная', 'home'], ['/matches', 'Матчи', 'calendar'],
    ...(canManage(me) ? [['/new', 'Создать матч', 'plus']] as [string, string, IconName][] : []),
    ['/notifications', 'Задачи', 'bell'], ['/profile', 'Профиль', 'user'],
  ];
  const active = (href: string) => href === '/' ? path === '/' : href === '/profile' ? path === '/profile' || path.startsWith('/profile/') || path === '/players' : path === href;
  return (
    <div className="nav-shell">
      <nav className={`nav ${canManage(me) ? '' : 'nav-player'}`} aria-label="Основная навигация">
        {items.map(([href, label, icon]) => (
          <Link key={href} href={href} className={`${active(href) ? 'on' : ''} ${href === '/new' ? 'nav-create' : ''}`} aria-label={label} aria-current={active(href) ? 'page' : undefined} onClick={() => haptic('light')}>
            <span className="nav-icon"><Icon name={icon} />{href === '/notifications' && !error && !!data?.tasks.length && <i className="nav-dot" aria-hidden="true" />}</span>
            {href !== '/new' && <span>{label}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
