import { registerAs } from '@nestjs/config';

// Central runtime configuration. All secrets come from env; never hard-code.

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: intEnv('PORT', 3001),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:4000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET ?? '',
  accessTokenTtlSec: intEnv('ACCESS_TOKEN_TTL_SEC', 900),
  refreshTokenTtlSec: intEnv('REFRESH_TOKEN_TTL_SEC', 60 * 60 * 24 * 14),
  iceServers: (process.env.ICE_SERVERS ?? 'stun:stun.l.google.com:19302')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  turnUrl: process.env.TURN_URL ?? '',
  turnUsername: process.env.TURN_USERNAME ?? '',
  turnCredential: process.env.TURN_CREDENTIAL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  redisEnabled: (process.env.REDIS_ENABLED ?? 'true') === 'true',
  // Age assurance: none | provider-name (documented in docs/age-assurance.md)
  ageAssuranceProvider: process.env.AGE_ASSURANCE_PROVIDER ?? 'none',
  ageAssuranceApiKey: process.env.AGE_ASSURANCE_API_KEY ?? '',
  // Text moderation: none | openai | perspector
  moderationProvider: process.env.MODERATION_PROVIDER ?? 'none',
  moderationApiKey: process.env.MODERATION_API_KEY ?? '',
  // Payments: DISABLED | STRIPE
  paymentsProvider: process.env.PAYMENTS_PROVIDER ?? 'DISABLED',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY ?? '',
  stripePriceYearly: process.env.STRIPE_PRICE_YEARLY ?? '',
  appName: process.env.APP_NAME ?? 'Buddy',
  // Matching policy defaults (overridable via admin API at runtime)
  maleQueueAllocationTargetPct: intEnv('MALE_QUEUE_ALLOCATION_TARGET_PCT', 50),
  sparsePoolThreshold: intEnv('SPARSE_POOL_THRESHOLD', 8),
  fairWaitBoostEnabled: (process.env.FAIR_WAIT_BOOST ?? 'true') === 'true',
  queueTimeoutMs: intEnv('QUEUE_TIMEOUT_MS', 120000),
}));

export type AppConfig = typeof appConfig;
