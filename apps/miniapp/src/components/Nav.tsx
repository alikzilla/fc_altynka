import { Link, useLocation } from 'wouter';
import { Icon, type IconName } from './Icon';
import { useNotifications } from '../state/notifications';
import { haptic } from '../lib/tg';
import { creatableCommunities, useMe } from '../state/me';

export function Nav() {
  const [path] = useLocation();
  const { data, error } = useNotifications();
  const me = useMe();
  // Only someone who can create a match gets the central ＋; players keep four destinations.
  const canCreate = creatableCommunities(me).length > 0;
  const items: [string, string, IconName][] = [
    ['/', 'Главная', 'home'], ['/matches', 'Матчи', 'calendar'],
    ...canCreate ? [['/new', 'Создать матч', 'plus'] as [string, string, IconName]] : [],
    ['/notifications', 'Задачи', 'bell'], ['/profile', 'Профиль', 'user'],
  ];
  const active = (href: string) => href === '/' ? path === '/' : href === '/profile' ? path === '/profile' || path.startsWith('/profile/') || path === '/players' || path.startsWith('/players/') : path === href;
  return (
    <div className="nav-shell">
      <nav className={`nav${canCreate ? '' : ' nav-four'}`} aria-label="Основная навигация">
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
