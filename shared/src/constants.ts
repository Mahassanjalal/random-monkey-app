// Product-wide tunables and copy. Frontend and backend both read these.

export const APP_NAME = 'Buddy';
export const APP_TAGLINE = 'Meet new people, safely.';
export const MIN_AGE = 18;
export const QUEUE_TIMEOUT_MS_DEFAULT = 120_000;
export const CHAT_RATE_LIMIT = { windowMs: 10_000, max: 12 };
export const SIGNALING_RATE_LIMIT = { windowMs: 2_000, max: 40 };
export const PREMIUM_FEATURES = {
  preferVerified: true,
  countryFilter: true,
  extendedInterests: true,
  priorityQueue: true,
  geoFilter: true,
  verificationBadge: true,
} as const;
