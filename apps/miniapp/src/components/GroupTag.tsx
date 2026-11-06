import type { CommunityDto } from '@altynka/core';
import { showGroups, useMe } from '../state/me';

export const GROUP_COLORS = ['var(--group-1)', 'var(--group-2)', 'var(--group-3)', 'var(--group-4)', 'var(--group-5)'];

/** Group label with a coloured dot; only people with more than one group see it. */
export function GroupTag({ community }: { community: CommunityDto }) {
  const me = useMe();
  if (!showGroups(me)) return null;
  return <span className="group-tag"><i aria-hidden="true" style={{ background: GROUP_COLORS[community.id % GROUP_COLORS.length] }} />{community.title}</span>;
}
