import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Req() req: AuthedRequest) {
    const rows = await this.prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  @Post(':id/read')
  async read(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId: req.user!.id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
