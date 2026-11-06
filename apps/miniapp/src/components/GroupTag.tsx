import type { CommunityDto } from '@altynka/core';
import { isMyGroup, showGroups, useMe } from '../state/me';

export const GROUP_COLORS = ['var(--group-1)', 'var(--group-2)', 'var(--group-3)', 'var(--group-4)', 'var(--group-5)'];

/** Group label with a coloured dot: for people with several groups, and always for a group the person has left. */
export function GroupTag({ community }: { community: CommunityDto }) {
  const me = useMe();
  if (!showGroups(me) && isMyGroup(me, community.id)) return null;
  return <span className="group-tag"><i aria-hidden="true" style={{ background: GROUP_COLORS[community.id % GROUP_COLORS.length] }} />{community.title}</span>;
}
