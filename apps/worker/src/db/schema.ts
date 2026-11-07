import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const communities = sqliteTable('communities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tgChatId: integer('tg_chat_id').notNull().unique(),
  title: text('title').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tgId: integer('tg_id').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name'),
  username: text('username'),
  displayName: text('display_name').notNull(),
  kaspiPhone: text('kaspi_phone'),
  profileCompletedAt: integer('profile_completed_at'),
  playingPosition: text('playing_position', { enum: ['goalkeeper', 'defender', 'midfielder', 'forward', 'universal'] }),
  dominantFoot: text('dominant_foot', { enum: ['right', 'left', 'both'] }),
  theme: text('theme', { enum: ['dark', 'light'] }).notNull().default('dark'),
  notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).notNull().default(false),
  pmAvailable: integer('pm_available', { mode: 'boolean' }).notNull().default(false),
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
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    telegramAdmin: integer('telegram_admin', { mode: 'boolean' }).notNull().default(false),
    legacy: integer('legacy', { mode: 'boolean' }).notNull().default(false),
  },
  t => [primaryKey({ columns: [t.communityId, t.userId] }), index('memberships_user').on(t.userId, t.communityId)],
);

export const events = sqliteTable('events', {
  protocolVersion: integer('protocol_version').$type<0 | 1>().notNull().default(0),
  startedAt: integer('started_at'),
  completedAt: integer('completed_at'),
  gameRevision: integer('game_revision').notNull().default(0),
  rosterRevision: integer('roster_revision').notNull().default(0),
  gameStateJson: text('game_state_json'),
  reviewSyncPending: integer('review_sync_pending', { mode: 'boolean' }).notNull().default(false),
  ratingEnabled: integer('rating_enabled', { mode: 'boolean' }).notNull().default(false),
  ratingSnapshot: text('rating_snapshot'),
  id: integer('id').primaryKey({ autoIncrement: true }),
  communityId: integer('community_id').notNull().references(() => communities.id),
  telegramChatId: integer('telegram_chat_id'),
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
  teamColors: text('team_colors'),
  teamColorsRevision: integer('team_colors_revision').notNull().default(0),
  teamsPublishedAt: integer('teams_published_at'),
  /** Снимок основы на момент сохранения составов: отличие = составы устарели. */
  teamsRoster: text('teams_roster'),
  eventMessageId: integer('event_message_id'),
  teamsMessageId: integer('teams_message_id'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at').notNull(),
}, t => [index('events_game_review_recovery').on(t.reviewSyncPending,t.completedAt)]);

export const signups = sqliteTable(
  'signups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eventId: integer('event_id').notNull().references(() => events.id),
    userId: integer('user_id').references(() => users.id),
    guestName: text('guest_name'),
    invitedBy: integer('invited_by').references(() => users.id),
    seq: integer('seq').notNull(),
    /** Не используется: очередь строгая, ручного перевода в основу нет. Колонка осталась от первой версии. */
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

export const skillAssessments = sqliteTable('skill_assessments', {
  userId: integer('user_id').primaryKey().references(() => users.id),
  version: integer('version').notNull().default(1),
  teamwork: integer('teamwork').notNull(), dribbling: integer('dribbling').notNull(),
  technique: integer('technique').notNull(), shooting: integer('shooting').notNull(),
  stamina: integer('stamina').notNull(), physical: integer('physical').notNull(),
  passing: integer('passing').notNull(), defending: integer('defending').notNull(),
  createdAt: integer('created_at').notNull(),
}, t => [...[
  t.teamwork, t.dribbling, t.technique, t.shooting, t.stamina, t.physical, t.passing, t.defending,
].map(column => check(`skill_${column.name}_range`, sql`typeof(${column}) = 'integer' and ${column} between 1 and 10`))]);

export const matchReviews = sqliteTable('match_reviews', {
  eventId: integer('event_id').primaryKey().references(() => events.id),
  completedAt: integer('completed_at').notNull(),
  completedBy: integer('completed_by').notNull().references(() => users.id),
  closesAt: integer('closes_at').notNull(),
  rosterJson: text('roster_json').notNull(),
}, t => [check('review_deadline', sql`${t.closesAt} > ${t.completedAt}`),
  check('review_roster_json', sql`json_valid(${t.rosterJson}) and json_array_length(${t.rosterJson}) > 0`), index('match_reviews_deadline').on(t.closesAt)]);
export const matchParticipants = sqliteTable('match_participants', {
  eventId: integer('event_id').notNull().references(() => matchReviews.eventId),
  signupId: integer('signup_id').notNull().references(() => signups.id),
  userId: integer('user_id').references(() => users.id),
  name: text('name').notNull(),
}, t => [primaryKey({ columns: [t.eventId, t.signupId] }), uniqueIndex('match_participants_user').on(t.eventId, t.userId)]);
export const reviewSubmissions = sqliteTable('review_submissions', {
  eventId: integer('event_id').notNull().references(() => matchReviews.eventId),
  userId: integer('user_id').notNull().references(() => users.id),
  payloadJson: text('payload_json').notNull(),
  skipped: integer('skipped', { mode: 'boolean' }).notNull(),
  gameScore: integer('game_score'),
  createdAt: integer('created_at').notNull(),
}, t => [primaryKey({ columns: [t.eventId, t.userId] }),
  foreignKey({ columns: [t.eventId, t.userId], foreignColumns: [matchParticipants.eventId, matchParticipants.userId] }),
  check('submission_payload_json', sql`json_valid(${t.payloadJson})`),
  check('submission_game_score', sql`${t.gameScore} is null or (typeof(${t.gameScore}) = 'integer' and ${t.gameScore} between 1 and 10)`),
  check('submission_skipped', sql`${t.skipped} in (0, 1)`),
  check('submission_answers', sql`(${t.skipped} = 1 and ${t.gameScore} is null and json_array_length(${t.payloadJson}, '$.scores') = 0) or (${t.skipped} = 0 and (${t.gameScore} is not null or json_array_length(${t.payloadJson}, '$.scores') > 0))`)]);
export const playerVotes = sqliteTable('player_votes', {
  eventId: integer('event_id').notNull().references(() => matchReviews.eventId),
  authorId: integer('author_id').notNull().references(() => users.id),
  recipientId: integer('recipient_id').notNull().references(() => users.id),
  score: integer('score').notNull(),
}, t => [primaryKey({ columns: [t.eventId, t.authorId, t.recipientId] }),
  foreignKey({ columns: [t.eventId, t.authorId], foreignColumns: [reviewSubmissions.eventId, reviewSubmissions.userId] }),
  foreignKey({ columns: [t.eventId, t.recipientId], foreignColumns: [matchParticipants.eventId, matchParticipants.userId] }),
  check('player_vote_score', sql`typeof(${t.score}) = 'integer' and ${t.score} between 1 and 10`),
  check('player_vote_other', sql`${t.authorId} <> ${t.recipientId}`), index('player_votes_recipient').on(t.recipientId, t.eventId)]);
