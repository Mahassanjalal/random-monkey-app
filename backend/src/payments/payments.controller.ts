import { Body, Controller, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt.guard';
import { PaymentsService } from './payments.service';
import { parseBody } from '../common/zod.pipe';
import { checkoutSchema } from '@bundle/shared';

@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  // Stripe webhook: signature-verified, idempotent. Requires rawBody (enabled in main.ts).
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    return this.payments.handleStripeWebhook(raw, signature);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  async checkout(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = parseBody(checkoutSchema, body);
    return this.payments.createCheckout(req.user!.id, dto.planKey);
  }

  @Post('dev-activate')
  @UseGuards(JwtAuthGuard)
  async devActivate(@Req() req: AuthedRequest, @Body() body: { planKey?: string }) {
    await this.payments.devActivate(req.user!.id, body.planKey ?? 'premium_monthly');
    return { ok: true, note: 'Dev-mode entitlement; no real billing occurred' };
  }
}
