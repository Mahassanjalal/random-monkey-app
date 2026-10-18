import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PREMIUM_FEATURES } from '@bundle/shared';
import type { EntitlementsDto, SubscriptionStatus } from '@bundle/shared';

@Injectable()
export class EntitlementsService {
  constructor(private prisma: PrismaService) {}

  async forUser(userId: string): Promise<EntitlementsDto> {
    const [sub, credits] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: { userId, status: 'ACTIVE', currentPeriodEnd: { gt: new Date() } },
        orderBy: { currentPeriodEnd: 'desc' },
      }),
      this.creditBalance(userId),
    ]);
    const premium = !!sub;
    return {
      tier: premium ? 'PREMIUM' : 'FREE',
      status: (sub?.status as SubscriptionStatus) ?? 'INACTIVE',
      activeUntil: sub?.currentPeriodEnd?.toISOString() ?? null,
      credits,
      features: premium
        ? {
            preferVerified: PREMIUM_FEATURES.preferVerified,
            countryFilter: PREMIUM_FEATURES.countryFilter,
            extendedInterests: PREMIUM_FEATURES.extendedInterests,
            priorityQueue: PREMIUM_FEATURES.priorityQueue,
            geoFilter: PREMIUM_FEATURES.geoFilter,
            verificationBadge: PREMIUM_FEATURES.verificationBadge,
          }
        : {
            preferVerified: false,
            countryFilter: false,
            extendedInterests: false,
            priorityQueue: false,
            geoFilter: false,
            verificationBadge: false,
          },
    };
  }

  async creditBalance(userId: string): Promise<number> {
    const last = await this.prisma.creditLedger.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return last?.balanceAfter ?? 0;
  }

  async applyCredits(
    userId: string,
    delta: number,
    reason: string,
    idempotencyKey: string,
    metadataJson: string = '{}',
  ): Promise<number> {
    // Idempotency: repeated key = no-op returning current balance.
    const existing = await this.prisma.creditLedger.findUnique({ where: { idempotencyKey } });
    if (existing) return existing.balanceAfter;
    const current = await this.creditBalance(userId);
    const next = current + delta;
    if (next < 0) throw new Error('insufficient credits');
    await this.prisma.creditLedger.create({
      data: {
        userId,
        delta,
        reason,
        idempotencyKey,
        balanceAfter: next,
        metadataJson,
      },
    });
    return next;
  }

  async hasPremium(userId: string): Promise<boolean> {
    const e = await this.forUser(userId);
    return e.tier === 'PREMIUM';
  }
}
