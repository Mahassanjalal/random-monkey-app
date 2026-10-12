import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { ChatModule } from '../chat/chat.module';
import { ReportsModule } from '../reports/reports.module';
import { ModerationModule } from '../moderation/moderation.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    MatchmakingModule,
    ChatModule,
    ReportsModule,
    ModerationModule,
    SubscriptionsModule,
  ],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
