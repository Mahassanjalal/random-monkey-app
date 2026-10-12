import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt.guard';
import { FriendshipsService } from './friendships.service';
import { parseBody } from '../common/zod.pipe';
import { friendRequestSchema } from '@bundle/shared';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendshipsController {
  constructor(private friendships: FriendshipsService) {}

  @Post('requests')
  async send(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = parseBody(friendRequestSchema, body);
    return this.friendships.sendRequest(req.user!.id, dto.username);
  }

  @Post('requests/:id/respond')
  async respond(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: { accept?: boolean }) {
    return this.friendships.respond(req.user!.id, id, !!body.accept);
  }

  @Get('requests')
  async pending(@Req() req: AuthedRequest) {
    return this.friendships.listPending(req.user!.id);
  }

  @Get()
  async friends(@Req() req: AuthedRequest) {
    return this.friendships.listFriends(req.user!.id);
  }

  @Delete(':friendId')
  async remove(@Req() req: AuthedRequest, @Param('friendId') friendId: string) {
    return this.friendships.removeFriend(req.user!.id, friendId);
  }

  @Post('follow/:userId')
  async follow(@Req() req: AuthedRequest, @Param('userId') userId: string) {
    return this.friendships.follow(req.user!.id, userId);
  }

  @Delete('follow/:userId')
  async unfollow(@Req() req: AuthedRequest, @Param('userId') userId: string) {
    return this.friendships.unfollow(req.user!.id, userId);
  }
}
