import { Link } from 'wouter';
import { ActionSheet } from './ActionSheet';
import { Icon, type IconName } from './Icon';
import { haptic } from '../lib/tg';
import { creatableCommunities, useMe } from '../state/me';

type Tone = 'pearl' | 'plum' | 'blue';

/** Разделы без места в доке. Создание матча видят только те, кто может его создать. */
export function MenuSheet({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const items: [string, string, IconName, Tone][] = [
    ...creatableCommunities(me).length > 0 ? [['/new', 'Создать матч', 'plus', 'pearl'] as [string, string, IconName, Tone]] : [],
    ['/stats', 'Статистика', 'chart', 'plum'], ['/players', 'Игроки', 'people', 'blue'],
  ];
  return <ActionSheet title="Меню" closeLabel="Закрыть меню" onClose={onClose} className="menu-sheet">
    <nav className="menu-icons" aria-label="Разделы">
      {items.map(([href, label, icon, tone]) => <Link key={href} href={href} className="menu-icon" onClick={() => { haptic('light'); onClose(); }}>
        <span className={`menu-icon-tile menu-${tone}`}><Icon name={icon} /></span><span>{label}</span>
      </Link>)}
    </nav>
  </ActionSheet>;
}
