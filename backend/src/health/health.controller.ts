import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { appConfig } from '../config/app.config';

@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const cfg = appConfig();
    const db = await this.prisma.$queryRaw`SELECT 1`.catch(() => null);
    const redisOk = this.redis.ready;
    const ok = !!db && redisOk;
    // Orchestrators restart on non-2xx: degraded deps => 503 so k8s/compose can recover.
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ok ? 'ok' : 'degraded',
      checks: {
        db: db ? 'ok' : 'fail',
        redis: redisOk ? 'ok' : 'degraded',
        ageAssurance: cfg.ageAssuranceProvider,
        payments: cfg.paymentsProvider,
        moderation: cfg.moderationProvider,
      },
    };
  }

  @Get('metrics')
  @HttpCode(200)
  async metrics() {
    // Minimal Prometheus-compatible surface until a dedicated /metrics module lands.
    // Counts are cheap single-row aggregates; scrape interval >=15s recommended.
    const [users, matches] = await Promise.all([
      this.prisma.user.count().catch(() => -1),
      this.prisma.match.count().catch(() => -1),
    ]);
    const online = await this.redis.onlineCount().catch(() => -1);
    return (
      `# HELP buddy_users_total Registered users\n# TYPE buddy_users_total gauge\n` +
      `buddy_users_total ${users}\n` +
      `# HELP buddy_matches_total Matches created\n# TYPE buddy_matches_total gauge\n` +
      `buddy_matches_total ${matches}\n` +
      `# HELP buddy_online_users Current presence set size\n# TYPE buddy_online_users gauge\n` +
      `buddy_online_users ${online}\n`
    );
  }
}
