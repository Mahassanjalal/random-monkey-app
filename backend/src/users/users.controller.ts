import { Controller, Delete, Get, HttpCode, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  async me(@Req() req: AuthedRequest) {
    return this.users.getMe(req.user!.id);
  }

  @Delete('me')
  @HttpCode(200)
  async deleteMe(@Req() req: AuthedRequest) {
    await this.users.deleteAccount(req.user!.id);
    return { ok: true };
  }
}
