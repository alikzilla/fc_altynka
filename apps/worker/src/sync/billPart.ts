import type { Db } from '../db/client';
import { billDto, getBillByEvent } from '../domain/bills';
import { getEvent } from '../domain/events';
import { renderBillMessage } from '../render/billMessage';
import type { Rendered } from '../render/eventMessage';
import type { OutNotice } from '../render/notices';
import type { LinkEnv } from '../telegram/links';
import { usersById } from './parts';

export async function renderBillPart(db: Db, eventId: number, env?: LinkEnv): Promise<Rendered | null> {
  const bill = await getBillByEvent(db, eventId);
  const ev = await getEvent(db, eventId);
  if (!bill || !ev) return null;
  const dto = await billDto(db, bill.id);
  return renderBillMessage({ billId: dto.id, date: ev.date, share: dto.share, status: dto.status, receiver: dto.receiver, lines: dto.lines }, eventId, env);
}

export async function resolveReminder(db: Db, billId: number): Promise<OutNotice> {
  const dto = await billDto(db, billId);
  const debtors = dto.lines.filter(l => l.state !== 'paid');
  const byId = await usersById(db, debtors.map(l => l.userId));
  const amountByTgId: Record<number, number> = {};
  const people = debtors.flatMap(l => {
    const u = byId.get(l.userId);
    if (!u) return [];
    amountByTgId[u.tgId] = l.due;
    return [{ signupId: 0, name: u.displayName, tgId: u.tgId, guestOf: null }];
  });
  return { kind: 'reminder', debtors: people, amountByTgId };
}
