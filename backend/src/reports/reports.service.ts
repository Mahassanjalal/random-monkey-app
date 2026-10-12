import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { logger } from '../common/logger';

export interface FileReportInput {
  matchId: string | null;
  reporterId: string;
  reportedUserId: string;
  reason: string;
  details?: string;
  severityHint?: string;
}

export interface FileReportResult {
  reportId: string;
  caseId: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private moderation: ModerationService,
  ) {}

  async fileReport(input: FileReportInput): Promise<FileReportResult> {
    if (input.reporterId === input.reportedUserId) {
      throw new ForbiddenException('Cannot report yourself');
    }
    // Authorization: reporter must share a match OR be reported directly.
    let authorized = true;
    if (input.matchId) {
      const participant = await this.prisma.matchParticipant.findFirst({
        where: { matchId: input.matchId, userId: input.reporterId },
      });
      const targetParticipant = await this.prisma.matchParticipant.findFirst({
        where: { matchId: input.matchId, userId: input.reportedUserId },
      });
      authorized = !!participant && !!targetParticipant;
    }
    if (!authorized) throw new ForbiddenException('Not authorized to report this user');
    const existingBlock = await this.prisma.block.findFirst({
      where: { userId: input.reportedUserId, blockedId: input.reporterId },
    });
    if (existingBlock) {
      // Target has already blocked reporter; still allow filing, no leak.
      void existingBlock;
    }
    const severity = input.severityHint ?? 'MEDIUM';
    const report = await this.prisma.userReport.create({
      data: {
        matchId: input.matchId,
        reporterId: input.reporterId,
        reportedUserId: input.reportedUserId,
        reason: input.reason,
        severity,
        details: input.details ?? '',
        status: 'OPEN',
      },
    });
    const modCase = await this.moderation.createCase({
      subjectUserId: input.reportedUserId,
      reportId: report.id,
      source: 'USER_REPORT',
      reason: input.reason,
      severity,
    });
    await this.prisma.userReport.update({
      where: { id: report.id },
      data: { caseId: modCase.id },
    });
    logger.info({ reportId: report.id, caseId: modCase.id }, 'report filed');
    return { reportId: report.id, caseId: modCase.id };
  }

  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw new ForbiddenException('Cannot block yourself');
    const exists = await this.prisma.user.findUnique({ where: { id: blockedId } });
    if (!exists || exists.deletedAt) throw new ForbiddenException('User not found');
    const already = await this.prisma.block.findFirst({
      where: { userId: blockerId, blockedId },
    });
    if (already) return;
    await this.prisma.block.create({ data: { userId: blockerId, blockedId } });
    logger.info({ blockerId, blockedId }, 'user blocked');
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.block.deleteMany({ where: { userId: blockerId, blockedId } });
  }

  async listBlocked(userId: string): Promise<{ blockedId: string; createdAt: Date }[]> {
    const rows = await this.prisma.block.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => ({ blockedId: r.blockedId, createdAt: r.createdAt }));
  }

  async isBlockedBetween(a: string, b: string): Promise<boolean> {
    const c = await this.prisma.block.count({
      where: { OR: [{ userId: a, blockedId: b }, { userId: b, blockedId: a }] },
    });
    return c > 0;
  }
}
