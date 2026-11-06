import { and, eq, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { events } from '../db/schema';

export const activeEventFilter = (legacyBilling = true) => or(
  and(eq(events.protocolVersion, 0), inArray(events.status, legacyBilling ? ['collecting','scheduled','billing'] : ['collecting','scheduled'])),
  and(eq(events.protocolVersion, 1), isNull(events.completedAt), ne(events.status, 'cancelled')),
);
export const pastEventFilter = (legacyBilling = true) => or(
  and(eq(events.protocolVersion, 0), inArray(events.status, legacyBilling ? ['billing','closed','cancelled'] : ['closed','cancelled'])),
  and(eq(events.protocolVersion, 1), or(isNotNull(events.completedAt), eq(events.status, 'cancelled'))),
);
