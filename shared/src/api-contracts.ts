import { z } from 'zod';
import {
  AccountRole,
  AgeAssuranceLevel,
  AppealStatus,
  ConnectionQuality,
  CreditLedgerReason,
  FriendRequestStatus,
  Gender,
  MatchMode,
  MatchStatus,
  MatchType,
  MediaModerationKind,
  ModerationActionType,
  ModerationCaseStatus,
  NotificationKind,
  OnlineVisibility,
  PaymentProviderKind,
  PaymentTransactionKind,
  PaymentTransactionStatus,
  ReportReason,
  ReportSeverity,
  SeekingPreference,
  SubscriptionStatus,
  UserReportStatus,
  VerificationBadgeKind,
  VerificationProvider,
  VerificationStatus,
} from './enums.js';

// ---------- shared primitives ----------
export const uuidSchema = z.string().uuid();
export const usernameSchema = z
  .string()
  .min(3)
  .max(24)
  .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscores only');
export const passwordSchema = z
  .string()
  .min(10)
  .max(128)
  .regex(/[a-z]/, 'lowercase')
  .regex(/[A-Z]/, 'uppercase')
  .regex(/[0-9]/, 'digit');
export const emailSchema = z.string().email().max(254);
export const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + 'T00:00:00Z');
    return !Number.isNaN(d.getTime());
  }, 'Invalid date');

// ---------- auth ----------
export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  birthDate: birthDateSchema,
  gender: z.nativeEnum(Gender),
  acceptedTermsAt: z.string().datetime(),
});
export const loginSchema = z.object({
  usernameOrEmail: z.string().min(3).max(254),
  password: z.string().min(1).max(128),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(512) });

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type RefreshDto = z.infer<typeof refreshSchema>;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface SessionUserDto {
  id: string;
  username: string;
  email: string;
  role: AccountRole;
  status: string;
  ageAssurance: AgeAssuranceLevel;
  isAdultVerified: boolean;
  mustCompleteAgeGate: boolean;
  onboardingStep: number | null;
  createdAt: string;
}

export interface AuthResponse {
  user: SessionUserDto;
  tokens: TokenPair;
}

// ---------- profiles / preferences ----------
export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(48).optional(),
  bio: z.string().max(280).optional(),
  gender: z.nativeEnum(Gender).optional(),
  interests: z.array(z.string().min(1).max(24)).max(12).optional(),
  avatarHue: z.number().int().min(0).max(359).optional(),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export interface ProfileDto {
  id: string;
  userId: string;
  displayName: string;
  bio: string;
  gender: Gender | null;
  avatarHue: number;
  interests: string[];
}

export const updatePreferencesSchema = z.object({
  seeking: z.nativeEnum(SeekingPreference),
  language: z.string().min(2).max(8).optional(),
  country: z.string().regex(/^[A-Za-z]{2}$/).optional(),
  interests: z.array(z.string().min(1).max(24)).max(8).optional(),
  preferVerified: z.boolean().optional(),
  chatModeDefault: z.nativeEnum(MatchMode).optional(),
  messageRetentionDays: z.number().int().min(0).max(365).optional(),
  onlineVisibility: z.nativeEnum(OnlineVisibility).optional(),
});
export type UpdatePreferencesDto = z.infer<typeof updatePreferencesSchema>;

export interface PreferencesDto {
  userId: string;
  seeking: SeekingPreference;
  language: string | null;
  country: string | null;
  interests: string[];
  preferVerified: boolean;
  chatModeDefault: MatchMode;
  messageRetentionDays: number;
  onlineVisibility: OnlineVisibility;
}

// ---------- queue / matchmaking ----------
export const queueJoinSchema = z.object({
  mode: z.nativeEnum(MatchMode),
});
export type QueueJoinDto = z.infer<typeof queueJoinSchema>;

export const rtcOfferSchema = z.object({
  matchId: z.string().min(8).max(64),
  sdp: z.string().min(10).max(20000),
});
export const rtcAnswerSchema = rtcOfferSchema;
export const rtcIceSchema = z.object({
  matchId: z.string().min(8).max(64),
  candidate: z.string().min(4).max(2000),
  sdpMid: z.string().max(8).optional(),
  sdpMLineIndex: z.number().int().min(0).optional(),
});
export const rtcStateSchema = z.object({
  matchId: z.string().min(8).max(64),
  state: z.enum(['checking', 'connected', 'disconnected', 'failed', 'closed']),
  quality: z.nativeEnum(ConnectionQuality).optional(),
});
export type RtcOfferDto = z.infer<typeof rtcOfferSchema>;
export type RtcAnswerDto = z.infer<typeof rtcAnswerSchema>;
export type RtcIceDto = z.infer<typeof rtcIceSchema>;
export type RtcStateDto = z.infer<typeof rtcStateSchema>;

export interface MatchFoundPayload {
  matchId: string;
  mode: MatchMode;
  peer: {
    userId: string;
    username: string;
    displayName: string;
    avatarHue: number;
    interests: string[];
    country: string | null;
    isVerified: boolean;
    badges: BadgeDto[];
    distanceKm: number | null;
  };
  /** Interests both users share (empty when matched by time only). */
  sharedInterests: string[];
  role: 'caller' | 'callee';
  iceServers: { urls: string[]; username?: string; credential?: string }[];
}

export interface QueueWaitingPayload {
  position: number | null;
  waitedMs: number;
}

export interface PeerStatePayload {
  state: 'checking' | 'connected' | 'disconnected' | 'failed' | 'closed';
  quality?: ConnectionQuality;
}

// ---------- chat ----------
export const chatMessageSchema = z
  .string()
  .min(1)
  .max(1000)
  .refine((s) => s.trim().length > 0, 'Empty message');
export const chatSendSchema = z.object({
  matchId: z.string().min(8).max(64),
  text: chatMessageSchema,
  kind: z.enum(['text', 'emoji', 'reaction']).default('text'),
});
export type ChatSendDto = z.infer<typeof chatSendSchema>;

export interface ChatMessagePayload {
  id: string;
  matchId: string;
  fromUserId: string;
  text: string;
  kind: 'text' | 'emoji' | 'reaction';
  sentAt: string;
}

// ---------- match ratings / karma ----------
export const rateMatchSchema = z.object({
  matchId: uuidSchema,
  /** 1..5 stars. 4-5 are positive karma, 3 neutral, 1-2 negative. */
  score: z.number().int().min(1).max(5),
});
export type RateMatchDto = z.infer<typeof rateMatchSchema>;

export interface KarmaDto {
  /** Average received score, 1..5, or null when unrated. */
  score: number | null;
  ratings: number;
  /** Positive / neutral / negative breakdown for UI. */
  positive: number;
  neutral: number;
  negative: number;
}

// ---------- friends / follows / blocks ----------
export const friendRequestSchema = z.object({ username: usernameSchema });
export type FriendRequestDto = z.infer<typeof friendRequestSchema>;

export interface FriendDto {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
  isOnline: boolean;
}

export interface FriendRequestView {
  id: string;
  status: FriendRequestStatus;
  fromUserId: string;
  fromUsername: string;
  toUserId: string;
  toUsername: string;
  createdAt: string;
}

// ---------- reports / moderation ----------
export const reportSchema = z.object({
  matchId: z.string().min(8).max(64),
  reportedUserId: uuidSchema,
  reason: z.nativeEnum(ReportReason),
  severityHint: z.nativeEnum(ReportSeverity).optional(),
  details: z.string().max(2000).optional(),
});
export type ReportDto = z.infer<typeof reportSchema>;

export const blockSchema = z.object({ userId: uuidSchema });
export type BlockDto = z.infer<typeof blockSchema>;

export const appealSchema = z.object({
  caseId: z.string().min(6).max(64),
  statement: z.string().min(20).max(4000),
});
export type AppealDto = z.infer<typeof appealSchema>;

export interface MyReportRow {
  id: string;
  status: UserReportStatus;
  reason: ReportReason;
  matchId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

// ---------- moderation case shapes (admin/moderator) ----------
export interface ModerationCaseRow {
  id: string;
  status: ModerationCaseStatus;
  reason: ReportReason;
  severity: ReportSeverity;
  subjectUserId: string;
  subjectUsername: string;
  reporterUserId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  aiAssessment: {
    scores: Record<string, number>;
    confidence: number;
    provider: string;
    flaggedLabels: string[];
  } | null;
}

export interface ModerationActionResult {
  caseId: string;
  action: ModerationActionType;
  until: string | null;
}

// ---------- subscriptions / payments ----------
export const checkoutSchema = z.object({
  planKey: z.enum(['premium_monthly', 'premium_yearly']),
});
export type CheckoutDto = z.infer<typeof checkoutSchema>;

export interface EntitlementsDto {
  tier: 'FREE' | 'PREMIUM';
  status: SubscriptionStatus;
  activeUntil: string | null;
  credits: number;
  features: {
    preferVerified: boolean;
    countryFilter: boolean;
    extendedInterests: boolean;
    priorityQueue: boolean;
    geoFilter: boolean;
    verificationBadge: boolean;
  };
}

export interface PlanInfo {
  key: 'premium_monthly' | 'premium_yearly';
  priceCents: number;
  currency: string;
  interval: 'month' | 'year';
  provider: PaymentProviderKind;
}

// ---------- geo / advanced filters ----------
export const updateGeoSchema = z.object({
  country: z.string().regex(/^[A-Za-z]{2}$/).optional(),
  region: z.string().max(64).optional(),
  city: z.string().max(64).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().int().min(1).max(500).optional(),
  geoEnabled: z.boolean().optional(),
  minAge: z.number().int().min(18).max(100).optional(),
  maxAge: z.number().int().min(18).max(100).optional(),
});
export type UpdateGeoDto = z.infer<typeof updateGeoSchema>;

export interface GeoLocationDto {
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  geoEnabled: boolean;
  minAge: number;
  maxAge: number;
}

// ---------- identity verification ----------
export const submitVerificationSchema = z.object({
  provider: z.nativeEnum(VerificationProvider),
  selfieUrl: z.string().url().optional(),
  idDocUrl: z.string().url().optional(),
});
export type SubmitVerificationDto = z.infer<typeof submitVerificationSchema>;

export interface VerificationDto {
  id: string;
  status: VerificationStatus;
  provider: VerificationProvider;
  selfieUrl: string | null;
  idDocUrl: string | null;
  checkedAt: string | null;
  createdAt: string;
}

export interface BadgeDto {
  kind: VerificationBadgeKind;
  issuedAt: string;
}

export interface UserWithBadgesDto {
  userId: string;
  username: string;
  displayName: string;
  avatarHue: number;
  isVerified: boolean;
  badges: BadgeDto[];
}

// ---------- credit products ----------
export const buyCreditsSchema = z.object({
  productKey: z.string().min(1).max(64),
  idempotencyKey: z.string().min(20).max(128),
});
export type BuyCreditsDto = z.infer<typeof buyCreditsSchema>;

export interface CreditProductDto {
  key: string;
  name: string;
  priceCents: number;
  currency: string;
  credits: number;
  active: boolean;
}

// ---------- admin ----------
export const adminUserUpdateSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'DEACTIVATED']).optional(),
  reason: z.string().max(500).optional(),
});
export type AdminUserUpdateDto = z.infer<typeof adminUserUpdateSchema>;

export const adminCaseUpdateSchema = z.object({
  status: z.nativeEnum(ModerationCaseStatus).optional(),
  action: z.nativeEnum(ModerationActionType).optional(),
  note: z.string().max(1000).optional(),
});
export type AdminCaseUpdateDto = z.infer<typeof adminCaseUpdateSchema>;

export const adminPolicySchema = z.object({
  key: z.literal('maleQueueAllocationTarget'),
  valuePct: z.number().int().min(0).max(100),
  note: z.string().max(500).optional(),
});
export type AdminPolicyDto = z.infer<typeof adminPolicySchema>;

export interface AdminMetrics {
  users: { total: number; activeToday: number; suspended: number; banned: number };
  queue: { video: number; text: number; avgWaitMs: number };
  matches: { last24h: number; activeNow: number; connectedPct: number };
  reports: { open: number; bySeverity: Record<ReportSeverity, number> };
  revenue: { activeSubs: number; mrrCents: number };
}

export interface AdminAuditRow {
  id: string;
  actorId: string;
  actorUsername: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminUsersPage {
  rows: {
    id: string;
    username: string;
    email: string;
    status: string;
    role: AccountRole;
    ageAssurance: AgeAssuranceLevel;
    createdAt: string;
  }[];
  total: number;
}

// ---------- notifications ----------
export interface NotificationDto {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

// ---------- admin policy / matching ----------
export interface MatchingPolicyState {
  version: number;
  maleQueueAllocationTargetPct: number;
  fairWaitBoostEnabled: boolean;
  sparsePoolThreshold: number;
  note: string | null;
  updatedAt: string;
}
