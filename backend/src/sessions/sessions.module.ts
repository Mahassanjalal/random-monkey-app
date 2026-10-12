import { Controller, Get, Module, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt.guard';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  @Get('heartbeat')
  async heartbeat(@Req() req: AuthedRequest) {
    await this.redis.heartbeat(req.user!.id);
    return { ok: true, ts: Date.now() };
  }

  @Get('active')
  async activeSession(@Req() req: AuthedRequest) {
    const count = await this.prisma.userSession.count({
      where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    return { sessionId: randomUUID(), deviceCount: count };
  }
}

@Module({
  controllers: [SessionsController],
})
export class SessionsModule {}
