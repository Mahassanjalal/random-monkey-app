// Enums shared between frontend and backend. Single source of truth.

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
  DEACTIVATED = 'DEACTIVATED',
}

export enum AccountRole {
  USER = 'USER',
  MODERATOR = 'MODERATOR',
  SUPPORT = 'SUPPORT',
  ADMIN = 'ADMIN',
}

export enum AgeAssuranceLevel {
  UNKNOWN = 'UNKNOWN',
  SELF_DECLARED = 'SELF_DECLARED',
  VERIFIED = 'VERIFIED',
  UNDERAGE_SUSPECTED = 'UNDERAGE_SUSPECTED',
  UNDERAGE_CONFIRMED = 'UNDERAGE_CONFIRMED',
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  NONBINARY = 'NONBINARY',
  OTHER = 'OTHER',
  PREFER_NOT_SAY = 'PREFER_NOT_SAY',
}

export enum SeekingPreference {
  EVERYONE = 'EVERYONE',
  MEN = 'MEN',
  WOMEN = 'WOMEN',
}

export enum MatchMode {
  VIDEO = 'VIDEO',
  TEXT = 'TEXT',
}

export enum MatchStatus {
  REQUESTED = 'REQUESTED',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
  SKIPPED = 'SKIPPED',
}

export enum ConnectionQuality {
  UNKNOWN = 'UNKNOWN',
  GOOD = 'GOOD',
  DEGRADED = 'DEGRADED',
  POOR = 'POOR',
}

export enum UserReportStatus {
  OPEN = 'OPEN',
  TRIAGED = 'TRIAGED',
  ACTIONED = 'ACTIONED',
  DISMISSED = 'DISMISSED',
}

export enum ReportReason {
  HARASSMENT = 'HARASSMENT',
  NUDITY = 'NUDITY',
  UNDERAGE = 'UNDERAGE',
  HATE = 'HATE',
  VIOLENCE = 'VIOLENCE',
  SCAM = 'SCAM',
  SELF_HARM = 'SELF_HARM',
  OTHER = 'OTHER',
}

export enum ReportSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum ModerationCaseStatus {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED = 'RESOLVED',
}

export enum ModerationActionType {
  WARN = 'WARN',
  RESTRICT_MATCHING = 'RESTRICT_MATCHING',
  SUSPEND = 'SUSPEND',
  BAN = 'BAN',
  DISMISS_CASE = 'DISMISS_CASE',
}

export enum AppealStatus {
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum SubscriptionStatus {
  INACTIVE = 'INACTIVE',
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
}

export enum PaymentProviderKind {
  DISABLED = 'DISABLED',
  STRIPE = 'STRIPE',
}

export enum PaymentTransactionStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentTransactionKind {
  SUBSCRIPTION = 'SUBSCRIPTION',
  ONE_TIME = 'ONE_TIME',
  REFUND = 'REFUND',
}

export enum CreditLedgerReason {
  GRANT = 'GRANT',
  SPEND = 'SPEND',
  REFUND = 'REFUND',
  ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT',
  SUBSCRIPTION_ALLOWANCE = 'SUBSCRIPTION_ALLOWANCE',
}

export enum NotificationKind {
  FRIEND_REQUEST = 'FRIEND_REQUEST',
  FRIEND_ACCEPTED = 'FRIEND_ACCEPTED',
  NEW_FOLLOWER = 'NEW_FOLLOWER',
  MODERATION_ACTION = 'MODERATION_ACTION',
  SUBSCRIPTION = 'SUBSCRIPTION',
  SYSTEM = 'SYSTEM',
}

export enum FriendRequestStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
}

export enum OnlineVisibility {
  EVERYONE = 'EVERYONE',
  FRIENDS = 'FRIENDS',
  NOBODY = 'NOBODY',
}

export enum MatchType {
  VIDEO = 'VIDEO',
  TEXT = 'TEXT',
}

export type SocketServerEvent =
  | 'queue:waiting'
  | 'queue:timed_out'
  | 'queue:error'
  | 'match:found'
  | 'rtc:offer'
  | 'rtc:answer'
  | 'rtc:ice'
  | 'rtc:state'
  | 'chat:message'
  | 'chat:typing'
  | 'chat:delivered'
  | 'match:skipped'
  | 'match:ended'
  | 'match:peer_left'
  | 'match:peer_reconnecting'
  | 'match:peer_reconnected'
  | 'report:ack'
  | 'block:ack'
  | 'moderation:warning'
  | 'error';

export type SocketClientEvent =
  | 'queue:join'
  | 'queue:leave'
  | 'queue:cancel'
  | 'rtc:offer'
  | 'rtc:answer'
  | 'rtc:ice'
  | 'rtc:state'
  | 'chat:message'
  | 'chat:typing'
  | 'match:resume'
  | 'match:skip'
  | 'match:end'
  | 'match:report'
  | 'match:block';
