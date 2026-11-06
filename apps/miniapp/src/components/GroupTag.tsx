import type { CommunityDto } from '@altynka/core';
import { isMyGroup, showGroups, useMe } from '../state/me';

export const GROUP_COLORS = ['var(--group-1)', 'var(--group-2)', 'var(--group-3)', 'var(--group-4)', 'var(--group-5)'];

/** Group label with a coloured dot: for people with several groups, and always for a group the person has left (or when `always`). */
export function GroupTag({ community, always = false }: { community: CommunityDto; always?: boolean }) {
  const me = useMe();
  if (!always && !showGroups(me) && isMyGroup(me, community.id)) return null;
  return <span className="group-tag" title={community.title}><i aria-hidden="true" style={{ background: GROUP_COLORS[community.id % GROUP_COLORS.length] }} /><span>{community.title}</span></span>;
}
