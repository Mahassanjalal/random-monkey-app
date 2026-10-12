import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { appConfig } from '../config/app.config';
import { PREMIUM_FEATURES } from '@bundle/shared';
import type { PlanInfo } from '@bundle/shared';
import { PaymentProviderKind } from '@bundle/shared';

export const SEED_PLANS: PlanInfo[] = [
  {
    key: 'premium_monthly',
    priceCents: 599,
    currency: 'USD',
    interval: 'month',
    provider: PaymentProviderKind.STRIPE,
  },
  {
    key: 'premium_yearly',
    priceCents: 4999,
    currency: 'USD',
    interval: 'year',
    provider: PaymentProviderKind.STRIPE,
  },
];

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  plans(): PlanInfo[] {
    const cfg = appConfig();
    const provider: PlanInfo['provider'] =
      cfg.paymentsProvider === 'STRIPE' ? PaymentProviderKind.STRIPE : PaymentProviderKind.DISABLED;
    return SEED_PLANS.map((p) => ({ ...p, provider }));
  }

  getPlan(planKey: string): PlanInfo | null {
    return SEED_PLANS.find((p) => p.key === planKey) ?? null;
  }

  async listPlansForUser(userId: string): Promise<PlanInfo[]> {
    const e = await this.entitlementsForUser(userId);
    if (e.tier === 'PREMIUM') return [];
    return this.plans();
  }

  private async entitlementsForUser(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE', currentPeriodEnd: { gt: new Date() } },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    if (sub) {
      return {
        tier: 'PREMIUM' as const,
        status: sub.status as string,
        activeUntil: sub.currentPeriodEnd?.toISOString() ?? null,
        features: PREMIUM_FEATURES,
      };
    }
    return {
      tier: 'FREE' as const,
      status: 'INACTIVE',
      activeUntil: null,
      features: {
        preferVerified: false,
        countryFilter: false,
        extendedInterests: false,
        priorityQueue: false,
      },
    };
  }

  async mySubscription(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { transactions: true },
    });
    if (!sub) return null;
    return {
      id: sub.id,
      planKey: sub.planKey,
      status: sub.status,
      provider: sub.provider,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      transactions: sub.transactions.map((t) => ({
        id: t.id,
        kind: t.kind,
        amountCents: t.amountCents,
        currency: t.currency,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  async cancel(userId: string, subscriptionId: string): Promise<void> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.status !== 'ACTIVE') return;
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'CANCELED', cancelAtPeriodEnd: true },
    });
  }

  async refund(
    userId: string,
    transactionId: string,
    idempotencyKey: string,
  ): Promise<void> {
    const tx = await this.prisma.paymentTransaction.findFirst({
      where: { id: transactionId, userId },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.status !== 'SUCCEEDED') throw new BadRequestException('Not refundable');
    // Refunds are processed by the payments provider; record intent + ledger.
    await this.prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: { status: 'REFUNDED' },
    });
  }
}
