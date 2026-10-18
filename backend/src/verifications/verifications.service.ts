import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { logger } from '../common/logger';
import { VerificationStatus, VerificationProvider, VerificationBadgeKind, AccountRole, NotificationKind } from '@bundle/shared';

@Injectable()
export class VerificationsService {
  constructor(
    private prisma: PrismaService,
    private moderation: ModerationService,
    private notifications: NotificationsService,
  ) {}

  async submit(userId: string, provider: VerificationProvider, selfieUrl?: string, idDocUrl?: string) {
    // Idempotency: if a PENDING verification already exists, return it.
    const existing = await this.prisma.identityVerification.findUnique({ where: { userId } });
    if (existing) {
      if (existing.status === VerificationStatus.PENDING) {
        return existing;
      }
      if (existing.status === VerificationStatus.APPROVED) {
        throw new BadRequestException('Verification already approved');
      }
    }

    const record = await this.prisma.identityVerification.create({
      data: {
        userId,
        provider,
        status: VerificationStatus.PENDING,
        selfieUrl,
        idDocUrl,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000), // 7 days to review
      },
    });
    logger.info({ userId, provider, verificationId: record.id }, 'verification submitted');
    return record;
  }

  async getMyVerification(userId: string) {
    const record = await this.prisma.identityVerification.findUnique({ where: { userId } });
    const badge = await this.prisma.verificationBadge.findUnique({ where: { userId } });
    if (!record && !badge) {
      return { status: null, badge: null };
    }
    return {
      status: record?.status ?? null,
      provider: record?.provider ?? null,
      selfieUrl: record?.selfieUrl ?? null,
      idDocUrl: record?.idDocUrl ?? null,
      checkedAt: record?.checkedAt?.toISOString() ?? null,
      createdAt: record?.createdAt?.toISOString() ?? null,
      badge: badge
        ? { kind: badge.kind as VerificationBadgeKind, issuedAt: badge.issuedAt.toISOString() }
        : null,
    };
  }

  async approve(verificationId: string, moderatorId: string) {
    const record = await this.prisma.identityVerification.findUnique({
      where: { id: verificationId },
      include: { user: true },
    });
    if (!record) throw new NotFoundException('Verification not found');
    if (record.status !== VerificationStatus.PENDING) {
      throw new BadRequestException('Verification is not pending');
    }

    await this.prisma.$transaction([
      this.prisma.identityVerification.update({
        where: { id: verificationId },
        data: {
          status: VerificationStatus.APPROVED,
          checkedBy: moderatorId,
          checkedAt: new Date(),
        },
      }),
      this.prisma.verificationBadge.upsert({
        where: { userId: record.userId },
        create: {
          userId: record.userId,
          kind: record.provider === VerificationProvider.ID_DOCUMENT ? VerificationBadgeKind.ID : VerificationBadgeKind.PHOTO,
        },
        update: {
          kind: record.provider === VerificationProvider.ID_DOCUMENT ? VerificationBadgeKind.ID : VerificationBadgeKind.PHOTO,
        },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { ageAssurance: 'VERIFIED' },
      }),
    ]);

    await this.notifications.create({
      userId: record.userId,
      kind: NotificationKind.VERIFICATION_APPROVED,
      title: 'Verification approved',
      body: 'Your identity has been verified. You now show a verified badge on your profile.',
    });

    logger.info({ verificationId, moderatorId, userId: record.userId }, 'verification approved');
    return { ok: true };
  }

  async reject(verificationId: string, moderatorId: string, reason?: string) {
    const record = await this.prisma.identityVerification.findUnique({
      where: { id: verificationId },
      include: { user: true },
    });
    if (!record) throw new NotFoundException('Verification not found');
    if (record.status !== VerificationStatus.PENDING) {
      throw new BadRequestException('Verification is not pending');
    }

    await this.prisma.identityVerification.update({
      where: { id: verificationId },
      data: {
        status: VerificationStatus.REJECTED,
        checkedBy: moderatorId,
        checkedAt: new Date(),
      },
    });

    await this.notifications.create({
      userId: record.userId,
      kind: NotificationKind.VERIFICATION_REJECTED,
      title: 'Verification rejected',
      body: reason ?? 'Your identity verification was not approved. You may re-submit.',
    });

    logger.info({ verificationId, moderatorId, userId: record.userId }, 'verification rejected');
    return { ok: true };
  }

  async listPending() {
    return this.prisma.identityVerification.findMany({
      where: { status: VerificationStatus.PENDING },
      include: {
        user: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  async requireModerator(role: string) {
    if (![AccountRole.ADMIN, AccountRole.MODERATOR, AccountRole.SUPPORT].includes(role as AccountRole)) {
      throw new ForbiddenException('Moderator role required');
    }
  }
}
