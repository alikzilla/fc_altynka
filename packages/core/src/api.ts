import type { Extra, LineState } from './bill';
import type { AppTheme, DominantFoot, PlayingPosition } from './profile';

export type Role = 'admin' | 'organizer' | 'player';
export type EventStatus = 'collecting' | 'scheduled' | 'playing' | 'billing' | 'closed' | 'cancelled';

export interface MeDto {
  userId: number;
  displayName: string;
  role: Role;
  kaspiPhone: string | null;
  profileCompleted?: boolean;
  playingPosition?: PlayingPosition | null;
  dominantFoot?: DominantFoot | null;
  theme?: AppTheme;
  notifications?: { enabled: boolean; available: boolean };
  community?: { id: number; title: string };
  telegram?: {
    firstName: string;
    lastName: string | null;
    username: string | null;
    photoUrl: string | null;
  };
}

export interface SignupDto {
  id: number;
  seq: number;
  name: string;
  userId: number | null;
  guestOfName: string | null;
  invitedByUserId: number | null;
  /** Только для организатора и админа: уровень игрока или гостя (guestLevel ?? 5). */
  level?: number;
}

export interface EventSummaryDto {
  /** Server snapshot used to keep kickoff behavior independent of the phone's clock. */
  serverNow?: number;
  id: number;
  date: string;
  status: EventStatus;
  startTime: string | null;
  durationHours: 1 | 2 | null;
  place: string | null;
  limit: number;
  mainCount: number;
  reserveCount: number;
  my: 'main' | 'reserve' | null;
}

export interface TeamsDto {
  teamCount: 2 | 3;
  teams: number[][];
  publishedAt: number | null;
  stale: boolean;
}

export interface BillLineDto {
  id: number;
  userId: number;
  name: string;
  units: number;
  amount: number;
  paidAmount: number | null;
  state: LineState;
  due: number;
}

export interface BillDto {
  id: number;
  receiver: { userId: number; name: string; kaspiPhone: string };
  fieldAmount: number;
  extras: Extra[];
  total: number;
  share: number;
  status: 'open' | 'closed';
  lines: BillLineDto[];
  /** Записи, между которыми поделен счёт: при правке галочки ставятся по ним. */
  participantSignupIds: number[];
}

export interface EventDetailDto extends EventSummaryDto {
  comment: string | null;
  main: SignupDto[];
  reserve: SignupDto[];
  teams: TeamsDto | null;
  bill: BillDto | null;
}

export interface MemberDto {
  userId: number;
  displayName: string;
  role: Role;
  level: number;
}

export interface EventsListDto {
  active: EventSummaryDto[];
  past: EventSummaryDto[];
}

export interface MatchArchiveDto {
  events: EventSummaryDto[];
  nextCursor: string | null;
}

export type NotificationTaskDto =
  | { kind: 'payment'; id: string; eventId: number; date: string; place: string | null; due: number; receiverName: string }
  | { kind: 'schedule'; id: string; eventId: number; date: string; place: string | null };

export interface NotificationsDto {
  tasks: NotificationTaskDto[];
}
