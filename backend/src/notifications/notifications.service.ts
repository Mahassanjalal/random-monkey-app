import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationKind } from '@bundle/shared';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async create({
    userId,
    kind,
    title,
    body,
  }: {
    userId: string;
    kind: NotificationKind;
    title: string;
    body: string;
  }) {
    return this.prisma.notification.create({
      data: { userId, kind: String(kind), title, body },
    });
  }

  async listForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }
}
