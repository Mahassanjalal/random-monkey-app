import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt.guard';
import { SubscriptionsService } from './subscriptions.service';
import { EntitlementsService } from './entitlements.service';
import { appConfig } from '../config/app.config';
import { parseBody } from '../common/zod.pipe';
import { checkoutSchema } from '@bundle/shared';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(
    private subs: SubscriptionsService,
    private entitlementsSvc: EntitlementsService,
  ) {}

  @Get('entitlements')
  async getEntitlements(@Req() req: AuthedRequest) {
    return this.entitlementsSvc.forUser(req.user!.id);
  }

  @Get('plans')
  async plans(@Req() req: AuthedRequest) {
    const cfg = appConfig();
    return {
      plans: await this.subs.listPlansForUser(req.user!.id),
      configured: cfg.paymentsProvider === 'STRIPE' && !!cfg.stripeSecretKey,
    };
  }

  @Get('me')
  async mine(@Req() req: AuthedRequest) {
    return this.subs.mySubscription(req.user!.id);
  }

  // Checkout is delegated to the payments REST surface (POST /payments/checkout)
  // to keep the subscriptions module independent of the payments module.
  @Post('checkout')
  async checkout(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = parseBody(checkoutSchema, body);
    const plan = this.subs.getPlan(dto.planKey);
    if (!plan) return { ok: false, error: 'Unknown plan' };
    return { planKey: dto.planKey, next: 'POST /payments/checkout', ok: true };
  }

  @Post('me/cancel')
  async cancel(@Req() req: AuthedRequest, @Body() body: { subscriptionId?: string }) {
    const mine = await this.subs.mySubscription(req.user!.id);
    const id = body.subscriptionId ?? mine?.id;
    if (!id) return { ok: false, error: 'No subscription' };
    await this.subs.cancel(req.user!.id, id);
    return { ok: true };
  }
}
