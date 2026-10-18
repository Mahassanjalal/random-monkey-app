import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { appConfig } from '../config/app.config';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { logger } from '../common/logger';

export interface WebhookResult {
  handled: 'succeeded' | 'failed' | 'ignored';
}

export interface CreditProduct {
  key: string;
  name: string;
  priceCents: number;
  currency: string;
  credits: number;
  active: boolean;
}

/**
 * Payment provider abstraction.
 * - STRIPE: real integration when credentials are configured.
 * - DISABLED: no billing; a documented dev-mode endpoint allows entitlement
 *   activation ONLY when payments are disabled and NODE_ENV is development.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private subs: SubscriptionsService,
    private entitlements: EntitlementsService,
  ) {}

  get provider(): string {
    return appConfig().paymentsProvider;
  }

  isConfigured(): boolean {
    const cfg = appConfig();
    return cfg.paymentsProvider === 'STRIPE' && !!cfg.stripeSecretKey;
  }

  async createCheckout(userId: string, planKey: string): Promise<{ url: string; mode: string }> {
    const cfg = appConfig();
    const plan = this.subs.getPlan(planKey);
    if (!plan) throw new NotFoundException('Unknown plan');
    if (!this.isConfigured()) {
      // Documented dev-mode path: no real billing. Clearly labelled, dev only.
      if (cfg.env !== 'development') {
        throw new ForbiddenException('Payments are not configured');
      }
      return { url: `/premium/dev-activate?planKey=${planKey}`, mode: 'DEV_MODE' };
    }
    // Real Stripe checkout session creation.
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(cfg.stripeSecretKey);
      const priceId =
        plan.interval === 'month' ? cfg.stripePriceMonthly : cfg.stripePriceYearly;
      if (!priceId) throw new ForbiddenException('Stripe price not configured');
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${cfg.corsOrigins[0] ?? ''}/premium?status=success`,
        cancel_url: `${cfg.corsOrigins[0] ?? ''}/premium?status=cancel`,
        client_reference_id: userId,
        metadata: { userId, planKey },
      });
      return { url: session.url ?? '', mode: 'STRIPE' };
    } catch (e) {
      logger.error({ err: String(e) }, 'stripe checkout failed');
      throw new BadRequestException('Payment provider error');
    }
  }

  /**
   * Stripe webhook. Signature-verified; idempotent via idempotency keys.
   */
  async handleStripeWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<WebhookResult> {
    const cfg = appConfig();
    if (cfg.paymentsProvider !== 'STRIPE') return { handled: 'ignored' };
    if (!cfg.stripeWebhookSecret) {
      throw new ForbiddenException('Stripe webhook secret not configured');
    }
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(cfg.stripeSecretKey);
    let event: import('stripe').Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature ?? '', cfg.stripeWebhookSecret);
    } catch (e) {
      logger.warn({ err: String(e) }, 'stripe webhook signature failed');
      throw new ForbiddenException('Invalid webhook signature');
    }
    return this.processStripeEvent(event);
  }

  async processStripeEvent(event: import('stripe').Stripe.Event): Promise<WebhookResult> {
    const userId = (event.data.object as { client_reference_id?: string; metadata?: { userId?: string } })
      .metadata?.userId ??
      ((event.data.object as { client_reference_id?: string }).client_reference_id ?? '');
    const idempotencyKey = `${event.id}`;
    const existing = await this.prisma.paymentTransaction.findUnique({
      where: { idempotencyKey },
    });
    if (existing && existing.status === 'SUCCEEDED') {
      return { handled: 'succeeded' };
    }
    let tx: { id: string };
    if (existing) {
      tx = existing;
    } else {
      tx = await this.prisma.paymentTransaction.create({
        data: {
          userId,
          provider: 'STRIPE',
          externalId: event.id,
          idempotencyKey,
          kind: 'SUBSCRIPTION',
          amountCents: 0,
          currency: 'USD',
          status: 'PENDING',
          rawEvent: JSON.stringify(event.data.object ?? {}),
        },
      });
    }
    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'invoice.payment_succeeded': {
        const planKey =
          ((event.data.object as { metadata?: { planKey?: string } }).metadata?.planKey ?? '') ||
          'premium_monthly';
        const plan = this.subs.getPlan(planKey) ?? this.subs.getPlan('premium_monthly')!;
        const periodEnd = new Date(
          Date.now() + (plan.interval === 'month' ? 30 : 365) * 24 * 3600 * 1000,
        );
        await this.prisma.$transaction([
          this.prisma.paymentTransaction.update({
            where: { id: tx.id },
            data: {
              status: 'SUCCEEDED',
              amountCents: plan.priceCents,
              completedAt: new Date(),
            },
          }),
          this.prisma.subscription.upsert({
            where: { id: userId ? await this.findOrCreateSub(userId) : '' },
            create: {
              userId,
              provider: 'STRIPE',
              planKey: plan.key,
              status: 'ACTIVE',
              currentPeriodEnd: periodEnd,
            },
            update: {
              status: 'ACTIVE',
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
            },
          }),
        ]);
        logger.info({ userId, planKey, eventId: event.id }, 'subscription activated');
        return { handled: 'succeeded' };
      }
      case 'customer.subscription.deleted':
      case 'invoice.payment_failed': {
        const sub = await this.prisma.subscription.findFirst({
          where: userId ? { userId } : { id: '' },
        });
        if (sub) {
          await this.prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'CANCELED' },
          });
        }
        if (existing) {
          await this.prisma.paymentTransaction.update({
            where: { id: existing.id },
            data: { status: 'FAILED' },
          });
        }
        return { handled: 'succeeded' };
      }
      default:
        return { handled: 'ignored' };
    }
  }

  /**
   * Dev-only entitlement activation when no payment provider is configured.
   * This is an explicit local-development affordance and refuses in production.
   */
  async devActivate(userId: string, planKey: string): Promise<void> {
    const cfg = appConfig();
    if (cfg.env !== 'development') {
      throw new ForbiddenException('Only allowed in development');
    }
    if (cfg.paymentsProvider === 'STRIPE') {
      throw new ForbiddenException('Dev activation disabled when payments are configured');
    }
    const plan = this.subs.getPlan(planKey) ?? this.subs.getPlan('premium_monthly')!;
    const sub = await this.findOrCreateSub(userId);
    await this.prisma.subscription.update({
      where: { id: sub },
      data: {
        provider: 'DISABLED',
        planKey: plan.key,
        status: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });
    logger.info({ userId, planKey }, 'DEV entitlement activated (payments disabled)');
  }

  private async findOrCreateSub(userId: string): Promise<string> {
    const sub = await this.prisma.subscription.findFirst({ where: { userId } });
    if (sub) return sub.id;
    const created = await this.prisma.subscription.create({
      data: { userId, provider: 'NONE', planKey: 'premium_monthly', status: 'INACTIVE' },
    });
    return created.id;
  }

  // ---------- credit products ----------

  async listCreditProducts(): Promise<CreditProduct[]> {
    const rows = await this.prisma.creditProduct.findMany({
      where: { active: true },
      orderBy: { priceCents: 'asc' },
    });
    return rows.map((r) => ({
      key: r.key,
      name: r.name,
      priceCents: r.priceCents,
      currency: r.currency,
      credits: r.credits,
      active: r.active,
    }));
  }

  async createCreditPurchase(
    userId: string,
    productKey: string,
    idempotencyKey: string,
  ): Promise<{ url: string; mode: string }> {
    const cfg = appConfig();
    const product = await this.prisma.creditProduct.findUnique({
      where: { key: productKey },
    });
    if (!product || !product.active) {
      throw new NotFoundException('Credit product not found');
    }

    // Idempotency: if a transaction with this key already succeeded, return its balance.
    const existing = await this.prisma.paymentTransaction.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return { url: `/premium?status=already_purchased`, mode: 'IDEMPOTENT' };
    }

    if (!this.isConfigured()) {
      // Dev-mode: grant credits immediately without real billing.
      if (cfg.env !== 'development') {
        throw new ForbiddenException('Payments are not configured');
      }
      const balance = await this.entitlements.applyCredits(
        userId,
        product.credits,
        `CREDIT_PURCHASE_DEV:${productKey}`,
        idempotencyKey,
        JSON.stringify({ productKey, devMode: true }),
      );
      await this.prisma.paymentTransaction.create({
        data: {
          userId,
          provider: 'DISABLED',
          externalId: null,
          idempotencyKey,
          kind: 'ONE_TIME',
          amountCents: product.priceCents,
          currency: 'USD',
          status: 'SUCCEEDED',
          completedAt: new Date(),
          rawEvent: JSON.stringify({ productKey, devMode: true }),
        },
      });
      logger.info({ userId, productKey, credits: product.credits, balance }, 'DEV credit purchase granted');
      return { url: `/premium?status=success&credits=${product.credits}`, mode: 'DEV_MODE' };
    }

    // Real Stripe checkout (one-time payment).
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(cfg.stripeSecretKey);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: product.currency.toLowerCase(),
              product_data: { name: product.name },
              unit_amount: product.priceCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${cfg.corsOrigins[0] ?? ''}/premium?status=success&credits=${product.credits}`,
        cancel_url: `${cfg.corsOrigins[0] ?? ''}/premium?status=cancel`,
        client_reference_id: userId,
        metadata: { userId, productKey, credits: String(product.credits), idempotencyKey },
      });
      // Record pending transaction.
      await this.prisma.paymentTransaction.create({
        data: {
          userId,
          provider: 'STRIPE',
          externalId: session.id,
          idempotencyKey,
          kind: 'ONE_TIME',
          amountCents: product.priceCents,
          currency: 'USD',
          status: 'PENDING',
          rawEvent: JSON.stringify({ productKey, credits: product.credits }),
        },
      });
      return { url: session.url ?? '', mode: 'STRIPE' };
    } catch (e) {
      logger.error({ err: String(e) }, 'stripe credit purchase failed');
      throw new BadRequestException('Payment provider error');
    }
  }

  async fulfillCreditPurchase(
    userId: string,
    productKey: string,
    credits: number,
    idempotencyKey: string,
  ): Promise<number> {
    // Idempotent fulfillment: repeated calls return current balance.
    const existing = await this.prisma.paymentTransaction.findUnique({
      where: { idempotencyKey },
    });
    if (existing && existing.status === 'SUCCEEDED') {
      return await this.entitlements.creditBalance(userId);
    }
    const balance = await this.entitlements.applyCredits(
      userId,
      credits,
      `CREDIT_PURCHASE:${productKey}`,
      idempotencyKey,
      JSON.stringify({ productKey }),
    );
    if (existing) {
      await this.prisma.paymentTransaction.update({
        where: { id: existing.id },
        data: { status: 'SUCCEEDED', completedAt: new Date() },
      });
    }
    logger.info({ userId, productKey, credits, balance }, 'credit purchase fulfilled');
    return balance;
  }
}
