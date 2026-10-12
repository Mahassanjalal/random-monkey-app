import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MatchmakingService } from './matchmaking.service';
import { RedisService } from '../redis/redis.service';
import { logger } from '../common/logger';

/**
 * Background pairing passes so matches don't depend solely on join-time triggers.
 * Runs every 500ms per mode; each pass is idempotent (atomic reservation).
 * For horizontal scale, elect a single worker (Redis lock) or shard by mode/region.
 */
@Injectable()
export class MatchmakingWorker {
  private running = false;

  constructor(
    private matchmaking: MatchmakingService,
    private redis: RedisService,
  ) {}

  @Cron('*/1 * * * * *')
  async pairTick() {
    if (this.running || !this.redis.ready) return;
    this.running = true;
    try {
      // Two passes per tick keep tail latency low without hot-looping the DB.
      for (const mode of ['VIDEO', 'TEXT'] as const) {
        try {
          const pair = await this.matchmaking.tryPair(mode as never);
          if (pair) {
            // tryPair already reserved + dequeued; the gateway must materialize the
            // match and emit match:found to both peers, or they'd be stranded.
            await this.matchmaking.onBackgroundPair?.(pair, mode as never);
          }
        } catch (e) {
          logger.warn({ err: String(e), mode }, 'background pair pass failed');
        }
      }
    } finally {
      this.running = false;
    }
  }
}
