import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, type AppEnv } from '../auth/middleware';
import { billLines } from '../db/schema';
import { billDto, closeBill, getBill, markPaid, remindDebtors, setLinePaid, upsertBill } from '../domain/bills';
import { getEvent } from '../domain/events';
import { eq } from 'drizzle-orm';
import { body, idParam, statusFor } from './validate';

const money = z.number().int().min(0).max(10_000_000);

const billBody = z.object({
  receiverUserId: z.number().int(),
  receiverKaspiPhone: z.string().max(40).optional(),
  fieldAmount: money,
  extras: z.array(z.object({ label: z.string().trim().min(1).max(40), amount: money })).max(10),
  participantSignupIds: z.array(z.number().int()).min(1).max(100),
});

export const billsApi = new Hono<AppEnv>();

type Get = <K extends keyof AppEnv['Variables']>(k: K) => AppEnv['Variables'][K];

/** Счёт существует и относится к группе пользователя. */
async function ownBill(get: Get, raw: string) {
  const id = idParam(raw);
  const bill = id === null ? null : await getBill(get('deps').db, id);
  const ev = bill ? await getEvent(get('deps').db, bill.eventId) : null;
  return bill && ev && ev.communityId === get('community').id ? bill : null;
}

billsApi.put('/events/:id/bill', requireRole('organizer'), body(billBody), async c => {
  const id = idParam(c.req.param('id'));
  const ev = id === null ? null : await getEvent(c.get('deps').db, id);
  if (!ev || ev.communityId !== c.get('community').id) return c.json({ error: 'not_found' }, 404);
  const r = await upsertBill(c.get('deps'), ev.id, c.req.valid('json'));
  if (r.kind === 'ok') return c.json(await billDto(c.get('deps').db, r.billId));
  if (r.kind === 'no_kaspi' || r.kind === 'bad_phone' || r.kind === 'invalid') return c.json({ error: r.kind }, 400);
  return c.json({ error: r.kind }, statusFor(r.kind));
});

billsApi.post('/bills/:id/paid', async c => {
  const bill = await ownBill(c.get, c.req.param('id'));
  if (!bill) return c.json({ error: 'not_found' }, 404);
  const r = await markPaid(c.get('deps'), bill.id, c.get('user').id, c.get('user').id);
  return c.json({ kind: r }, r === 'not_in_bill' ? 404 : statusFor(r));
});

billsApi.post('/bill-lines/:id', body(z.object({ paid: z.boolean() })), async c => {
  const id = idParam(c.req.param('id'));
  const [line] = id === null ? [] : await c.get('deps').db.select().from(billLines).where(eq(billLines.id, id));
  const bill = line ? await ownBill(c.get, String(line.billId)) : null;
  if (!line || !bill) return c.json({ error: 'not_found' }, 404);
  const r = await setLinePaid(c.get('deps'), line.id, c.req.valid('json').paid, { userId: c.get('user').id, role: c.get('role') });
  return c.json({ kind: r }, statusFor(r));
});

billsApi.post('/bills/:id/remind', requireRole('organizer'), async c => {
  const bill = await ownBill(c.get, c.req.param('id'));
  if (!bill) return c.json({ error: 'not_found' }, 404);
  const r = await remindDebtors(c.get('deps'), bill.id);
  return c.json({ kind: r }, r === 'nobody' ? 409 : statusFor(r));
});

billsApi.post('/bills/:id/close', requireRole('organizer'), async c => {
  const bill = await ownBill(c.get, c.req.param('id'));
  if (!bill) return c.json({ error: 'not_found' }, 404);
  return c.json({ kind: await closeBill(c.get('deps'), bill.id) });
});
