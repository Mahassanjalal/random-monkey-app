import { Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingWorker } from './matchmaking.worker';
import { ReservationService } from './reservation';

@Module({
  providers: [MatchmakingService, MatchmakingWorker, ReservationService],
  exports: [MatchmakingService, ReservationService],
})
export class MatchmakingModule {}
