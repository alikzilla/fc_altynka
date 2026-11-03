import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const communities = sqliteTable('communities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tgChatId: integer('tg_chat_id').notNull().unique(),
  title: text('title').notNull(),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tgId: integer('tg_id').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name'),
  username: text('username'),
  displayName: text('display_name').notNull(),
  kaspiPhone: text('kaspi_phone'),
  createdAt: integer('created_at').notNull(),
});

export const memberships = sqliteTable(
  'memberships',
  {
    communityId: integer('community_id').notNull().references(() => communities.id),
    userId: integer('user_id').notNull().references(() => users.id),
    role: text('role', { enum: ['organizer', 'player'] }).notNull().default('player'),
    level: integer('level').notNull().default(5),
    /** Когда членство в группе последний раз подтвердил Telegram; 0 — ни разу. */
    checkedAt: integer('checked_at').notNull().default(0),
  },
  t => [primaryKey({ columns: [t.communityId, t.userId] })],
);

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  communityId: integer('community_id').notNull().references(() => communities.id),
  date: text('date').notNull(),
  comment: text('comment'),
  startTime: text('start_time'),
  durationHours: integer('duration_hours').$type<1 | 2>(),
  place: text('place'),
  status: text('status', { enum: ['collecting', 'scheduled', 'billing', 'closed', 'cancelled'] })
    .notNull()
    .default('collecting'),
  baseLimit: integer('base_limit').notNull().default(10),
  teamCount: integer('team_count').$type<2 | 3>(),
  teamsPublishedAt: integer('teams_published_at'),
  /** Снимок основы на момент сохранения составов: отличие = составы устарели. */
  teamsRoster: text('teams_roster'),
  eventMessageId: integer('event_message_id'),
  teamsMessageId: integer('teams_message_id'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at').notNull(),
});

export const signups = sqliteTable(
  'signups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eventId: integer('event_id').notNull().references(() => events.id),
    userId: integer('user_id').references(() => users.id),
    guestName: text('guest_name'),
    invitedBy: integer('invited_by').references(() => users.id),
    seq: integer('seq').notNull(),
    manual: integer('manual', { mode: 'boolean' }).notNull().default(false),
    leftAt: integer('left_at'),
    guestLevel: integer('guest_level'),
    createdAt: integer('created_at').notNull(),
  },
  t => [
    uniqueIndex('signups_event_seq').on(t.eventId, t.seq),
    uniqueIndex('signups_event_user').on(t.eventId, t.userId).where(sql`user_id is not null`),
  ],
);

export const teamAssignments = sqliteTable('team_assignments', {
  signupId: integer('signup_id').primaryKey().references(() => signups.id, { onDelete: 'cascade' }),
  eventId: integer('event_id').notNull().references(() => events.id),
  teamIndex: integer('team_index').notNull(),
});

export const bills = sqliteTable('bills', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull().unique().references(() => events.id),
  receiverUserId: integer('receiver_user_id').notNull().references(() => users.id),
  fieldAmount: integer('field_amount').notNull(),
  extrasJson: text('extras_json').notNull().default('[]'),
  participantsJson: text('participants_json').notNull().default('[]'),
  share: integer('share').notNull(),
  status: text('status', { enum: ['open', 'closed'] }).notNull().default('open'),
  messageId: integer('message_id'),
  createdAt: integer('created_at').notNull(),
});

export const billLines = sqliteTable(
  'bill_lines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    billId: integer('bill_id').notNull().references(() => bills.id),
    userId: integer('user_id').notNull().references(() => users.id),
    units: integer('units').notNull(),
    amount: integer('amount').notNull(),
    paidAmount: integer('paid_amount'),
    markedBy: integer('marked_by').references(() => users.id),
    paidAt: integer('paid_at'),
  },
  t => [uniqueIndex('bill_lines_bill_user').on(t.billId, t.userId)],
);

export type CommunityRow = typeof communities.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type SignupRow = typeof signups.$inferSelect;
export type BillRow = typeof bills.$inferSelect;
export type BillLineRow = typeof billLines.$inferSelect;
