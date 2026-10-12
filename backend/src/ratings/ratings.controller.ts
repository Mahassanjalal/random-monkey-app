import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthedRequest } from '../auth/jwt.guard';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RatingsService } from './ratings.service';
import { parseBody } from '../common/zod.pipe';
import { rateMatchSchema } from '@bundle/shared';

@Controller('ratings')
@UseGuards(JwtAuthGuard)
export class RatingsController {
  constructor(private ratings: RatingsService) {}

  @Post()
  async rate(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = parseBody(rateMatchSchema, body);
    return this.ratings.rateMatch(req.user!.id, dto.matchId, dto.score);
  }

  @Get('match/:matchId')
  async myRating(@Req() req: AuthedRequest, @Param('matchId') matchId: string) {
    return this.ratings.myRating(req.user!.id, matchId);
  }

  @Get('karma/me')
  async myKarma(@Req() req: AuthedRequest) {
    return this.ratings.karmaFor(req.user!.id);
  }

  @Get('karma/:userId')
  async userKarma(@Param('userId') userId: string) {
    return this.ratings.karmaFor(userId);
  }
}
