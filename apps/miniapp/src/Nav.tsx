import { Link, useLocation } from 'wouter';
import { canManage, useMe } from './me';

export function Nav() {
  const me = useMe();
  const [path] = useLocation();
  const items: [string, string][] = [['/', 'Сборы'], ...(canManage(me) ? ([['/players', 'Игроки']] as [string, string][]) : []), ['/profile', 'Профиль']];
  const active = (href: string) => (href === '/' ? path === '/' || path.startsWith('/event') || path === '/new' : path.startsWith(href));
  return (
    <nav className="nav">
      {items.map(([href, label]) => (
        <Link key={href} href={href} className={active(href) ? 'on' : ''} aria-current={active(href) ? 'page' : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
