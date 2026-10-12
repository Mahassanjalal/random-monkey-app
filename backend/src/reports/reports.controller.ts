import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthedRequest } from '../auth/jwt.guard';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { ReportsService } from './reports.service';
import { parseBody } from '../common/zod.pipe';
import { blockSchema, reportSchema } from '@bundle/shared';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Post()
  async file(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = parseBody(reportSchema, body);
    return this.reports.fileReport({
      matchId: dto.matchId,
      reporterId: req.user!.id,
      reportedUserId: dto.reportedUserId,
      reason: dto.reason,
      details: dto.details,
      severityHint: dto.severityHint,
    });
  }

  @Post('blocks')
  async block(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = parseBody(blockSchema, body);
    await this.reports.blockUser(req.user!.id, dto.userId);
    return { ok: true };
  }

  @Delete('blocks/:userId')
  async unblock(@Req() req: AuthedRequest, @Param('userId') userId: string) {
    await this.reports.unblockUser(req.user!.id, userId);
    return { ok: true };
  }

  @Get('blocks')
  async list(@Req() req: AuthedRequest) {
    return this.reports.listBlocked(req.user!.id);
  }
}
