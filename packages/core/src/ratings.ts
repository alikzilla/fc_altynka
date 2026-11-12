import type { DominantFoot, PlayingPosition } from './profile';
import type { Role } from './api';
import type { PlayerMeetingStatistics, PlayerStatistics } from './playerStatistics';
import type { AchievementId } from './achievements';

export const SKILLS = [
  { key: 'teamwork', label: 'Игра в команде', hint: 'Открывания, помощь партнёрам и взаимодействие' },
  { key: 'dribbling', label: 'Дриблинг', hint: 'Обводка соперника с мячом' },
  { key: 'technique', label: 'Техника', hint: 'Первое касание, приём и контроль мяча' },
  { key: 'shooting', label: 'Удары', hint: 'Точность и качество завершения атак' },
  { key: 'stamina', label: 'Выносливость', hint: 'Сохранение темпа до конца игры' },
  { key: 'physical', label: 'Физика', hint: 'Сила, устойчивость и единоборства' },
  { key: 'passing', label: 'Пас', hint: 'Точность и своевременность передач' },
  { key: 'defending', label: 'Защита / отбор', hint: 'Позиция без мяча, перехваты и отбор' },
] as const;
export type SkillKey = typeof SKILLS[number]['key'];
export type SkillAnswers = Record<SkillKey, number>;
export const REVIEW_WINDOW_MS = 72 * 60 * 60 * 1000;
export const MIN_REVIEW_VOTES = 3;
export interface RatedMatch { eventId: number; completedAt: number; score: number; votes: number }

export function selfAssessmentRating(answers: SkillAnswers): number {
  return SKILLS.reduce((sum, skill) => sum + answers[skill.key], 0) / SKILLS.length;
}

export function calculatePlayerRating(initial: number, matches: readonly RatedMatch[]): number {
  const recent = matches.filter(m => m.votes >= MIN_REVIEW_VOTES)
    .sort((a, b) => b.completedAt - a.completedAt || b.eventId - a.eventId).slice(0, 10);
  const value = (3 * initial + recent.reduce((sum, m) => sum + m.score, 0)) / (3 + recent.length);
  return Math.min(10, Math.max(1, Math.round((value + Number.EPSILON) * 10) / 10));
}

export const formatRating = (value: number): string => value.toFixed(1).replace('.', ',');

export interface PlayerRatingDto {
  value: number;
  initial: number;
  selfAssessment: SkillAnswers | null;
  matchesCount: number;
}
export interface PlayerSummaryDto {
  userId: number;
  displayName: string;
  /** Последнее фото из Telegram; нет, пока человек не открывал мини-апп или скрыл фото. */
  photoUrl?: string | null;
  playingPosition: PlayingPosition | null;
  dominantFoot: DominantFoot | null;
  rating: PlayerRatingDto;
  /** Травма: в списке игроков — в этой группе, в профиле — хотя бы в одной общей с вами группе. */
  injured?: boolean;
}
export interface PlayerProfileDto extends PlayerSummaryDto {
  telegramUsername: string | null;
  role: Role;
  statistics: PlayerStatistics;
  gameHistory: PlayerMeetingStatistics[];
  pinnedAchievement: AchievementId | null;
  history: { eventId: number; date: string; place: string | null; score: number | null; community: { id: number; title: string }; protocolVersion?: 0 | 1 }[];
}
export interface ReviewInput {
  scores: { userId: number; score: number }[];
  gameScore: number | null;
  skipped: boolean;
}
export interface MatchReviewSummaryDto {
  state: 'legacy' | 'pending' | 'open' | 'submitted' | 'skipped' | 'ineligible' | 'closed';
  canFinish: boolean;
  completedAt: number | null;
  closesAt: number | null;
  gameScore: number | null;
}
export interface MatchReviewDto extends MatchReviewSummaryDto {
  serverNow: number;
  participants: { userId: number; name: string; score: number | null }[];
  ownSubmission: ReviewInput | null;
}
