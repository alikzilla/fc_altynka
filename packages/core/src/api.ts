import type { Extra, LineState } from './bill';
import type { AppTheme, DominantFoot, PlayingPosition } from './profile';
import type { MatchReviewSummaryDto, PlayerRatingDto, PlayerSummaryDto } from './ratings';
import type { GameProtocolDto } from './games';

export type Role = 'admin' | 'organizer' | 'player';
export type EventStatus = 'collecting' | 'scheduled' | 'playing' | 'billing' | 'closed' | 'cancelled';

export interface CommunityDto { id: number; title: string; }
export interface CommunitiesDto { communities: CommunityDto[]; }
/** A group the person currently belongs to, with their role in it. */
export interface MyCommunityDto { id: number; title: string; role: Role }

export interface MeDto {
  rating?: PlayerRatingDto;
  userId: number;
  displayName: string;
  kaspiPhone: string | null;
  profileCompleted?: boolean;
  playingPosition?: PlayingPosition | null;
  dominantFoot?: DominantFoot | null;
  theme?: AppTheme;
  notifications?: { enabled: boolean; available: boolean };
  /** Confirmed groups, sorted by title; empty for a person without groups. */
  communities: MyCommunityDto[];
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
  /** Только для организатора и админа, только у игроков: сохранённый номер Kaspi (получатель счёта). */
  kaspiPhone?: string | null;
}

export interface EventSummaryDto {
  protocolVersion?: 0 | 1;
  startedAt?: number | null;
  completedAt?: number | null;
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
  community: CommunityDto;
}

export interface TeamsDto {
  ratingSnapshot?: Record<number, number>;
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
  gameProtocol?: GameProtocolDto;
  review?: MatchReviewSummaryDto;
  comment: string | null;
  main: SignupDto[];
  reserve: SignupDto[];
  teams: TeamsDto | null;
  bill: BillDto | null;
  /** The viewer's role in this event's group. */
  viewerRole: Role;
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
  | { kind: 'skills'; id: string }
  | { kind: 'review'; id: string; eventId: number; date: string; place: string | null; closesAt: number; community: CommunityDto }
  | { kind: 'payment'; id: string; eventId: number; billId: number; date: string; place: string | null; due: number; receiverName: string; receiverKaspiPhone: string; community: CommunityDto }
  | { kind: 'schedule'; id: string; eventId: number; date: string; place: string | null; community: CommunityDto };

export interface NotificationsDto {
  tasks: NotificationTaskDto[];
}

/** Players of each of the viewer's groups; one person may appear in several groups with the same rating. */
export interface PlayersDto { groups: { community: CommunityDto; role: Role; players: PlayerSummaryDto[] }[] }
