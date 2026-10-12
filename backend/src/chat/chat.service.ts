import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { logger } from '../common/logger';

export interface ChatMessageView {
  id: string;
  matchId: string;
  fromUserId: string;
  text: string;
  kind: string;
  sentAt: string;
}

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async persistMessage(
    matchId: string,
    fromUserId: string,
    text: string,
    kind: string,
  ): Promise<ChatMessageView> {
    const msg = await this.prisma.chatMessage.create({
      data: { matchId, senderId: fromUserId, text: text.slice(0, 1000), kind },
    });
    return {
      id: msg.id,
      matchId: msg.matchId,
      fromUserId: msg.senderId,
      text: msg.text,
      kind: msg.kind,
      sentAt: msg.createdAt.toISOString(),
    };
  }

  async messagesForMatch(matchId: string, limit = 100): Promise<ChatMessageView[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { matchId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse().map((m) => ({
      id: m.id,
      matchId: m.matchId,
      fromUserId: m.senderId,
      text: m.text,
      kind: m.kind,
      sentAt: m.createdAt.toISOString(),
    }));
  }

  async persistRtcStat(
    matchId: string,
    reporterUserId: string,
    state: string,
    quality: string,
  ): Promise<void> {
    try {
      await this.prisma.rtcStat.create({
        data: { matchId, reporterUserId, state, quality },
      });
    } catch (e) {
      logger.warn({ err: String(e) }, 'rtc stat persist failed');
    }
  }
}
