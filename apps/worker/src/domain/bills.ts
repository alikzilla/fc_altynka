import { computeBill, lineStatus, normalizeKzPhone, matchPhase, type BillDto, type Extra, type Role } from '@altynka/core';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { billLines, bills, events, memberships, signups, users, type BillRow, type UserRow } from '../db/schema';
import { usersById } from '../sync/parts';
import { canManage, getEvent, type Deps } from './events';

export type UpsertBillResult =
  | { kind: 'ok'; billId: number }
  | { kind: 'no_kaspi' }
  | { kind: 'bad_phone' }
  | { kind: 'receiver_phone_locked' }
  | { kind: 'invalid' }
  | { kind: 'not_found' }
  | { kind: 'not_scheduled' }
  | { kind: 'not_started' }
  | { kind: 'closed' };

export async function getBill(db: Db, billId: number): Promise<BillRow | null> {
  return (await db.select().from(bills).where(eq(bills.id, billId)))[0] ?? null;
}

export async function getBillByEvent(db: Db, eventId: number): Promise<BillRow | null> {
  return (await db.select().from(bills).where(eq(bills.eventId, eventId)))[0] ?? null;
}

/** Open bills where this person receives the money, in every group. */
export function openBillsReceivedBy(db: Db, userId: number) {
  return db.select({ eventId: bills.eventId }).from(bills)
    .where(and(eq(bills.receiverUserId, userId), eq(bills.status, 'open')));
}

/** The receiver's phone changed: every open bill they receive, in every group, shows the new number. */
export async function resyncReceiverBills(d: Deps, userId: number, exceptEventId?: number): Promise<void> {
  for (const bill of await openBillsReceivedBy(d.db, userId)) {
    if (bill.eventId !== exceptEventId) await d.sync.request(bill.eventId, { parts: ['bill'] });
  }
}

/**
 * `actorUserId` — who saves the bill. The phone is shared by all groups, so the form may set it
 * only when the receiver has none yet or the receiver saves the bill themselves.
 */
export async function upsertBill(
  d: Deps,
  eventId: number,
  v: { receiverUserId: number; receiverKaspiPhone?: string; fieldAmount: number; extras: Extra[]; participantSignupIds: number[] },
  actorUserId?: number,
): Promise<UpsertBillResult> {
  const ev = await getEvent(d.db, eventId);
  if (!ev) return { kind: 'not_found' };
  if (ev.status === 'cancelled' || ev.protocolVersion !== 1 && ev.status === 'closed') return { kind: 'closed' };
  const existing = await getBillByEvent(d.db, eventId);
  if (existing?.status === 'closed') return { kind: 'closed' };
  if (ev.protocolVersion === 1) {
    if (ev.status === 'collecting' || !ev.startTime || !ev.durationHours) return { kind: 'not_scheduled' };
    if (ev.startedAt === null) return { kind: 'not_started' };
  } else {
    if (ev.status === 'collecting' || (!existing && (ev.status !== 'scheduled' || !ev.startTime || !ev.durationHours))) return { kind: 'not_scheduled' };
    if (!existing && matchPhase(ev, d.now) !== 'playing') return { kind: 'not_started' };
  }
  const [receiver] = await d.db.select().from(users).where(eq(users.id, v.receiverUserId));
  const [receiverMembership] = await d.db.select().from(memberships).where(and(eq(memberships.communityId, ev.communityId), eq(memberships.userId, v.receiverUserId), eq(memberships.active, true)));
  if (!receiver || !receiverMembership || !v.participantSignupIds.length) return { kind: 'invalid' };
  const parts = await d.db
    .select()
    .from(signups)
    .where(and(eq(signups.eventId, eventId), isNull(signups.leftAt), inArray(signups.id, v.participantSignupIds)));
  if (parts.length !== new Set(v.participantSignupIds).size) return { kind: 'invalid' };
  let phone = receiver.kaspiPhone;
  let phoneChanged = false;
  if (v.receiverKaspiPhone !== undefined && v.receiverKaspiPhone.trim() !== '') {
    const submitted = normalizeKzPhone(v.receiverKaspiPhone);
    if (!submitted) return { kind: 'bad_phone' };
    if (submitted !== receiver.kaspiPhone) {
      // Only the receiver changes an existing number (in their profile or in their own bill).
      if (receiver.kaspiPhone && receiver.id !== actorUserId) return { kind: 'receiver_phone_locked' };
      await d.db.update(users).set({ kaspiPhone: submitted, profileCompletedAt: receiver.profileCompletedAt ?? d.now })
        .where(eq(users.id, receiver.id));
      phone = submitted;
      phoneChanged = true;
    } else if (receiver.profileCompletedAt === null) {
      await d.db.update(users).set({ profileCompletedAt: d.now }).where(eq(users.id, receiver.id));
    }
  }
  if (!phone) return { kind: 'no_kaspi' };

  // Доля гостя висит на пригласившем.
  const units = new Map<number, number>();
  for (const s of parts) {
    const who = s.userId ?? s.invitedBy;
    if (who !== null) units.set(who, (units.get(who) ?? 0) + 1);
  }
  const calc = computeBill(v.fieldAmount, v.extras, [...units].map(([userId, u]) => ({ userId, units: u })));

  let billId: number;
  const fields = {
    receiverUserId: receiver.id,
    fieldAmount: v.fieldAmount,
    extrasJson: JSON.stringify(v.extras),
    participantsJson: JSON.stringify([...new Set(v.participantSignupIds)].sort((a, b) => a - b)),
    share: calc.share,
    status: 'open' as const,
  };
  if (existing) {
    await d.db.update(bills).set(fields).where(eq(bills.id, existing.id));
    billId = existing.id;
  } else {
    const [row] = await d.db.insert(bills).values({ ...fields, eventId, createdAt: d.now }).returning({ id: bills.id });
    billId = row.id;
  }
  const old = new Map((await d.db.select().from(billLines).where(eq(billLines.billId, billId))).map(l => [l.userId, l]));
  const keep = new Set(calc.lines.map(l => l.userId));
  const stmts = [
    ...[...old.values()].filter(l => !keep.has(l.userId)).map(l => d.db.delete(billLines).where(eq(billLines.id, l.id))),
    ...calc.lines.map(l => {
      const prev = old.get(l.userId);
      const isReceiver = l.userId === receiver.id;
      const wasAutoPaid = prev && existing && prev.userId === existing.receiverUserId && !isReceiver;
      const paid = isReceiver
        ? { paidAmount: l.amount, markedBy: receiver.id, paidAt: d.now }
        : wasAutoPaid
          ? { paidAmount: null, markedBy: null, paidAt: null }
          : { paidAmount: prev?.paidAmount ?? null, markedBy: prev?.markedBy ?? null, paidAt: prev?.paidAt ?? null };
      return prev
        ? d.db.update(billLines).set({ units: l.units, amount: l.amount, ...paid }).where(eq(billLines.id, prev.id))
        : d.db.insert(billLines).values({ billId, userId: l.userId, units: l.units, amount: l.amount, ...paid });
    }),
    d.db.update(events).set({ status: 'billing' }).where(eq(events.id, eventId)),
  ];
  await d.db.batch(stmts as [ (typeof stmts)[number], ...(typeof stmts)[number][] ]);
  await closeIfAllPaid(d, billId);
  await d.sync.request(eventId, { parts: ['bill', 'event'] });
  if (phoneChanged) await resyncReceiverBills(d, receiver.id, eventId);
  return { kind: 'ok', billId };
}

async function closeIfAllPaid(d: Deps, billId: number): Promise<boolean> {
  const lines = await d.db.select().from(billLines).where(eq(billLines.billId, billId));
  if (!lines.length || lines.some(l => lineStatus(l.amount, l.paidAmount).state !== 'paid')) return false;
  const bill = await getBill(d.db, billId);
  if (!bill) return false;
  await d.db.batch([
    d.db.update(bills).set({ status: 'closed' }).where(eq(bills.id, billId)),
    d.db.update(events).set({ status: 'closed' }).where(eq(events.id, bill.eventId)),
  ]);
  return true;
}

export async function markPaid(
  d: Deps,
  billId: number,
  userId: number,
  by: number,
  expected?: { due: number; receiverUserId: number; receiverPhone: string },
): Promise<'ok' | 'already' | 'not_in_bill' | 'closed' | 'stale'> {
  const bill = await getBill(d.db, billId);
  if (!bill) return 'not_in_bill';
  if (bill.status === 'closed') return 'closed';
  const [line] = await d.db
    .select()
    .from(billLines)
    .where(and(eq(billLines.billId, billId), eq(billLines.userId, userId)));
  if (!line) return 'not_in_bill';
  if (lineStatus(line.amount, line.paidAmount).state === 'paid') return 'already';
  const changed = await d.db.update(billLines).set({ paidAmount: line.amount, markedBy: by, paidAt: d.now })
    .where(and(eq(billLines.id, line.id), expected ? and(
      eq(billLines.amount, line.amount),
      sql`${billLines.amount} - coalesce(${billLines.paidAmount}, 0) = ${expected.due}`,
      sql`exists (select 1 from bills join events on events.id = bills.event_id join users on users.id = bills.receiver_user_id where bills.id = ${billId} and bills.status = 'open' and bills.receiver_user_id = ${expected.receiverUserId} and users.kaspi_phone = ${expected.receiverPhone})`,
    ) : undefined)).returning({ id: billLines.id });
  if (!changed.length) return 'stale';
  const closed = await closeIfAllPaid(d, billId);
  await d.sync.request(bill.eventId, { parts: closed ? ['bill', 'event'] : ['bill'] });
  return 'ok';
}

export async function setLinePaid(
  d: Deps,
  lineId: number,
  paid: boolean,
  actor: { userId: number; role: Role },
): Promise<'ok' | 'forbidden' | 'not_found'> {
  const [line] = await d.db.select().from(billLines).where(eq(billLines.id, lineId));
  const bill = line ? await getBill(d.db, line.billId) : null;
  if (!line || !bill) return 'not_found';
  if (!canManage(actor.role) && bill.receiverUserId !== actor.userId) return 'forbidden';
  await d.db
    .update(billLines)
    .set(paid ? { paidAmount: line.amount, markedBy: actor.userId, paidAt: d.now } : { paidAmount: null, markedBy: null, paidAt: null })
    .where(eq(billLines.id, lineId));
  let parts: ('bill' | 'event')[] = ['bill'];
  if (paid) {
    if (await closeIfAllPaid(d, bill.id)) parts = ['bill', 'event'];
  } else if (bill.status === 'closed') {
    await d.db.batch([
      d.db.update(bills).set({ status: 'open' }).where(eq(bills.id, bill.id)),
      d.db.update(events).set({ status: 'billing' }).where(eq(events.id, bill.eventId)),
    ]);
    parts = ['bill', 'event'];
  }
  await d.sync.request(bill.eventId, { parts });
  return 'ok';
}

export async function remindDebtors(d: Deps, billId: number): Promise<'ok' | 'nobody' | 'not_found'> {
  const bill = await getBill(d.db, billId);
  if (!bill) return 'not_found';
  const lines = await d.db.select().from(billLines).where(eq(billLines.billId, billId));
  if (lines.every(l => lineStatus(l.amount, l.paidAmount).state === 'paid')) return 'nobody';
  await d.sync.request(bill.eventId, { parts: [], notices: [{ kind: 'reminder', billId }] });
  return 'ok';
}

export async function closeBill(d: Deps, billId: number): Promise<'ok' | 'not_found'> {
  const bill = await getBill(d.db, billId);
  if (!bill) return 'not_found';
  await d.db.batch([
    d.db.update(bills).set({ status: 'closed' }).where(eq(bills.id, billId)),
    d.db.update(events).set({ status: 'closed' }).where(eq(events.id, bill.eventId)),
  ]);
  await d.sync.request(bill.eventId, { parts: ['bill', 'event'] });
  return 'ok';
}

export async function billDto(db: Db, billId: number): Promise<BillDto> {
  const bill = (await getBill(db, billId))!;
  return billDtoFromRow(db, bill);
}

export async function billDtoFromRow(db: Db, bill: BillRow, knownUsers?: ReadonlyMap<number, UserRow>): Promise<BillDto> {
  const lines = await db.select().from(billLines).where(eq(billLines.billId, bill.id));
  const byId = await usersById(db, [bill.receiverUserId, ...lines.map(l => l.userId)], knownUsers);
  const receiver = byId.get(bill.receiverUserId)!;
  const extras = JSON.parse(bill.extrasJson) as Extra[];
  return {
    id: bill.id,
    receiver: { userId: receiver.id, name: receiver.displayName, kaspiPhone: receiver.kaspiPhone ?? '' },
    fieldAmount: bill.fieldAmount,
    extras,
    total: bill.fieldAmount + extras.reduce((s, x) => s + x.amount, 0),
    share: bill.share,
    status: bill.status,
    lines: lines
      .map(l => ({
        id: l.id,
        userId: l.userId,
        name: byId.get(l.userId)?.displayName ?? '?',
        units: l.units,
        amount: l.amount,
        paidAmount: l.paidAmount,
        ...lineStatus(l.amount, l.paidAmount),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    participantSignupIds: JSON.parse(bill.participantsJson) as number[],
  };
}
