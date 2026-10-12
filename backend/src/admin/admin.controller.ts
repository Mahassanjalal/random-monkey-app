import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt.guard';
import { AdminService } from './admin.service';
import { parseBody } from '../common/zod.pipe';
import { adminCaseUpdateSchema, adminPolicySchema, adminUserUpdateSchema } from '@bundle/shared';
import { ModerationService } from '../moderation/moderation.service';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private admin: AdminService,
    private moderation: ModerationService,
  ) {}

  private require(req: AuthedRequest, permission: string) {
    this.admin.requirePermission(req.user!.role, permission);
  }

  @Get('users')
  async users(@Req() req: AuthedRequest, @Query() q: { q?: string; status?: string }) {
    this.require(req, 'users');
    return this.admin.users(q);
  }

  @Post('users/:id/status')
  async updateStatus(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.require(req, 'users');
    const dto = parseBody(adminUserUpdateSchema, body);
    return this.admin.updateUserStatus(req.user!.id, id, dto);
  }

  @Get('metrics')
  async metrics(@Req() req: AuthedRequest) {
    this.require(req, 'metrics');
    return this.admin.metrics();
  }

  @Get('audit')
  async audit(@Req() req: AuthedRequest) {
    this.require(req, 'audit');
    return this.admin.auditLog();
  }

  @Get('flags')
  async flags(@Req() req: AuthedRequest) {
    this.require(req, 'flags');
    return this.admin.flags(req.user!.id);
  }

  @Post('flags')
  async setFlag(
    @Req() req: AuthedRequest,
    @Body() body: { key?: string; enabled?: boolean; rolloutPct?: number; note?: string },
  ) {
    this.require(req, 'flags');
    if (!body.key || typeof body.enabled !== 'boolean') return { ok: false };
    return this.admin.setFlag(
      req.user!.id,
      body.key,
      body.enabled,
      body.rolloutPct ?? 0,
      body.note,
    );
  }

  @Get('policies')
  async policies(@Req() req: AuthedRequest) {
    this.require(req, 'policies');
    return this.admin.policies(req.user!.id);
  }

  @Post('policies')
  async setPolicy(@Req() req: AuthedRequest, @Body() body: unknown) {
    this.require(req, 'policies');
    const dto = parseBody(adminPolicySchema, body);
    return this.admin.setPolicy(
      req.user!.id,
      { maleQueueAllocationTargetPct: dto.valuePct },
      dto.note ?? '',
    );
  }

  @Get('cases')
  async cases(@Req() req: AuthedRequest, @Query('status') status?: string) {
    this.require(req, 'cases');
    return this.moderation.listCases(status);
  }

  @Post('cases/:id')
  async updateCase(
    @Req() req: AuthedRequest,
    @Param('id') caseId: string,
    @Body() body: unknown,
  ) {
    this.require(req, 'cases');
    const dto = parseBody(adminCaseUpdateSchema, body);
    if (dto.status) {
      await this.moderation.updateCaseStatus(caseId, dto.status, req.user!.id, dto.note ?? '');
    }
    if (dto.action) {
      await this.moderation.applyAction(caseId, req.user!.id, dto.action, dto.note ?? '');
    }
    return { ok: true };
  }

  @Get('appeals')
  async appeals(@Req() req: AuthedRequest) {
    this.require(req, 'appeals');
    return this.admin.prisma.appeal.findMany({
      where: { status: 'SUBMITTED' },
      include: { user: { select: { username: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('appeals/:id')
  async decideAppeal(
    @Req() req: AuthedRequest,
    @Param('id') appealId: string,
    @Body() body: { approve?: boolean; note?: string },
  ) {
    this.require(req, 'appeals');
    await this.admin.prisma.appeal.update({
      where: { id: appealId },
      data: {
        status: body.approve ? 'APPROVED' : 'REJECTED',
        decidedBy: req.user!.id,
        decidedAt: new Date(),
        decisionNote: body.note ?? '',
      },
    });
    await this.admin.audit(req.user!.id, 'appeal.decide', 'Appeal', appealId, {
      approve: !!body.approve,
    });
    return { ok: true };
  }
}
