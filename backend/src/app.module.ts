import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { appConfig } from './config/app.config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProfilesModule } from './profiles/profiles.module';
import { PreferencesModule } from './preferences/preferences.module';
import { AgeAssuranceModule } from './age-assurance/age-assurance.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { SessionsModule } from './sessions/sessions.module';
import { FriendshipsModule } from './friendships/friendships.module';
import { ReportsModule } from './reports/reports.module';
import { RatingsModule } from './ratings/ratings.module';
import { ModerationModule } from './moderation/moderation.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RealtimeModule } from './realtime/realtime.module';
import { logger } from './common/logger';
import { ZodValidationPipe } from './common/zod.pipe';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig], ignoreEnvFile: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 120 },
      { name: 'auth', ttl: 60000, limit: 10 },
    ]),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    PreferencesModule,
    AgeAssuranceModule,
    MatchmakingModule,
    SessionsModule,
    FriendshipsModule,
    ReportsModule,
    RatingsModule,
    ModerationModule,
    SubscriptionsModule,
    PaymentsModule,
    NotificationsModule,
    AdminModule,
    AnalyticsModule,
    RealtimeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // helmet + cookieParser are applied once in main.ts (single source).
    // Keep module configure as a no-op hook for future route-specific middleware.
    void consumer;
    logger.info('app module configured');
  }
}
