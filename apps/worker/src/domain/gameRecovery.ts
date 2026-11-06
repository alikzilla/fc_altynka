import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { communities, events } from '../db/schema';
import { getEvent, type Deps } from './events';
import { ensureGameReview } from './ratings';
import { getCommunity } from './members';

/** The pending bit is committed with completion; clearing it follows both durable side effects. */
export async function recoverGameReview(d:Deps,eventId:number):Promise<boolean> {
  const ev=await getEvent(d.db,eventId);
  if(!ev || ev.protocolVersion!==1 || ev.completedAt===null || !ev.reviewSyncPending) return false;
  if(!(await getCommunity(d.db,ev.communityId))?.active) return false;
  await ensureGameReview(d,eventId);
  await d.sync.request(eventId,{parts:['event'],review:true});
  await d.db.update(events).set({reviewSyncPending:false}).where(and(eq(events.id,eventId),eq(events.completedAt,ev.completedAt)));
  return true;
}

/** Bounded, indexed recovery that does not depend on the organizer retrying the request. */
export async function recoverPendingGameReviews(d:Deps):Promise<{recovered:number;failed:number}> {
  const pending=await d.db.select({id:events.id}).from(events)
    .innerJoin(communities,eq(communities.id,events.communityId))
    .where(and(eq(events.protocolVersion,1),eq(events.reviewSyncPending,true),isNotNull(events.completedAt),eq(communities.active,true)))
    .orderBy(asc(events.completedAt),asc(events.id)).limit(50);
  let recovered=0,failed=0;
  for(const event of pending) {
    try {if(await recoverGameReview(d,event.id))recovered++;}
    catch {failed++;}
  }
  return {recovered,failed};
}
