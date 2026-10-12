import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get('queue')
  async queueMetrics() {
    const [video, text] = await Promise.all([
      this.redis.queueSize('VIDEO'),
      this.redis.queueSize('TEXT'),
    ]);
    return { video, text, online: await this.redis.onlineCount() };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async myStats(@Req() req: AuthedRequest) {
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const [matches, messages, reportsFiled, reportsReceived] = await Promise.all([
      this.prisma.matchParticipant.count({
        where: { userId: req.user!.id, joinedAt: { gte: dayAgo } },
      }),
      this.prisma.chatMessage.count({ where: { senderId: req.user!.id, createdAt: { gte: dayAgo } } }),
      this.prisma.userReport.count({ where: { reporterId: req.user!.id, createdAt: { gte: dayAgo } } }),
      this.prisma.userReport.count({
        where: { reportedUserId: req.user!.id, createdAt: { gte: dayAgo } },
      }),
    ]);
    return { matches, messages, reportsFiled, reportsReceived };
  }
}
