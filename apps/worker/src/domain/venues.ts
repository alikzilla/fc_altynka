import { VENUES_MAX, type VenueDto } from '@altynka/core';
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { venues } from '../db/schema';

export interface VenueInput { name: string; address: string | null; mapUrl: string | null; hourlyRate: number | null }

const toDto = (row: typeof venues.$inferSelect): VenueDto => ({ id: row.id, name: row.name, address: row.address, mapUrl: row.mapUrl, hourlyRate: row.hourlyRate });

/** Площадки группы в порядке добавления. */
export async function listVenues(db: Db, communityId: number): Promise<VenueDto[]> {
  return (await db.select().from(venues).where(eq(venues.communityId, communityId)).orderBy(asc(venues.id))).map(toDto);
}

/** Название уникально в группе без учёта регистра: по нему площадка находится в матче. */
export async function addVenue(d: { db: Db; now: number }, communityId: number, userId: number, v: VenueInput): Promise<VenueDto | 'duplicate' | 'too_many'> {
  const existing = await d.db.select({ name: venues.name }).from(venues).where(eq(venues.communityId, communityId));
  if (existing.length >= VENUES_MAX) return 'too_many';
  const key = v.name.toLocaleLowerCase('ru');
  if (existing.some(row => row.name.toLocaleLowerCase('ru') === key)) return 'duplicate';
  const [row] = await d.db.insert(venues).values({ communityId, ...v, createdBy: userId, createdAt: d.now }).onConflictDoNothing().returning();
  return row ? toDto(row) : 'duplicate';
}

/** Переименование не трогает матчи: они хранят название на момент назначения. */
export async function updateVenue(db: Db, communityId: number, id: number, v: VenueInput): Promise<VenueDto | 'duplicate' | null> {
  const existing = await db.select({ id: venues.id, name: venues.name }).from(venues).where(eq(venues.communityId, communityId));
  if (!existing.some(row => row.id === id)) return null;
  const key = v.name.toLocaleLowerCase('ru');
  if (existing.some(row => row.id !== id && row.name.toLocaleLowerCase('ru') === key)) return 'duplicate';
  try {
    const [row] = await db.update(venues).set(v).where(and(eq(venues.id, id), eq(venues.communityId, communityId))).returning();
    return row ? toDto(row) : null;
  } catch (error) {
    // A concurrent rename to the same exact name hits the unique index.
    if (String((error as Error)?.message ?? error).includes('UNIQUE')) return 'duplicate';
    throw error;
  }
}

export async function venueCommunity(db: Db, id: number): Promise<number | null> {
  return (await db.select({ g: venues.communityId }).from(venues).where(eq(venues.id, id)))[0]?.g ?? null;
}

/** Матчи хранят название площадки, поэтому прошедшие и назначенные игры после удаления не меняются. */
export async function removeVenue(db: Db, communityId: number, id: number): Promise<boolean> {
  return (await db.delete(venues).where(and(eq(venues.id, id), eq(venues.communityId, communityId))).returning({ id: venues.id })).length > 0;
}
