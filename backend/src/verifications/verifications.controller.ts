import { Body, Controller, Get, Post, Req, UseGuards, Param, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt.guard';
import { VerificationsService } from './verifications.service';
import { parseBody } from '../common/zod.pipe';
import { submitVerificationSchema } from '@bundle/shared';

@Controller('verifications')
@UseGuards(JwtAuthGuard)
export class VerificationsController {
  constructor(private svc: VerificationsService) {}

  @Post('submit')
  async submit(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = parseBody(submitVerificationSchema, body);
    return this.svc.submit(req.user!.id, dto.provider, dto.selfieUrl, dto.idDocUrl);
  }

  @Get('me')
  async me(@Req() req: AuthedRequest) {
    return this.svc.getMyVerification(req.user!.id);
  }

  @Post(':id/approve')
  async approve(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.svc.requireModerator(req.user!.role);
    return this.svc.approve(id, req.user!.id);
  }

  @Post(':id/reject')
  async reject(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: { reason?: string }) {
    await this.svc.requireModerator(req.user!.role);
    return this.svc.reject(id, req.user!.id, body?.reason);
  }

  @Get('pending')
  async pending(@Req() req: AuthedRequest) {
    await this.svc.requireModerator(req.user!.role);
    return this.svc.listPending();
  }
}
