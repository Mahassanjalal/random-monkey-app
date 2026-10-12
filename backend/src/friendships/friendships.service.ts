import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { logger } from '../common/logger';

@Injectable()
export class FriendshipsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async sendRequest(fromUserId: string, toUsername: string) {
    const toUser = await this.prisma.user.findFirst({
      where: { username: toUsername, deletedAt: null },
    });
    if (!toUser) throw new BadRequestException('User not found');
    if (toUser.id === fromUserId) throw new BadRequestException('Cannot friend yourself');
    const blocked = await this.prisma.block.findFirst({
      where: { userId: toUser.id, blockedId: fromUserId },
    });
    if (blocked) throw new ForbiddenException('Not available');
    const existing = await this.prisma.friendRequest.findFirst({
      where: { fromUserId, toUserId: toUser.id, status: 'PENDING' },
    });
    if (existing) return existing;
    const fr = await this.prisma.friendRequest.create({
      data: { fromUserId, toUserId: toUser.id, status: 'PENDING' },
    });
    await this.prisma.notification.create({
      data: {
        userId: toUser.id,
        kind: 'FRIEND_REQUEST',
        title: 'New friend request',
        body: `@${(await this.prisma.user.findUnique({ where: { id: fromUserId } }))?.username ?? ''} wants to connect`,
      },
    });
    logger.info({ fromUserId, toUserId: toUser.id }, 'friend request sent');
    return fr;
  }

  async respond(userId: string, requestId: string, accept: boolean) {
    const fr = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!fr || fr.toUserId !== userId) throw new ForbiddenException('Not authorized');
    if (fr.status !== 'PENDING') throw new BadRequestException('Already handled');
    const status = accept ? 'ACCEPTED' : 'DECLINED';
    await this.prisma.friendRequest.update({ where: { id: requestId }, data: { status } });
    if (accept) {
      // Canonical friendship ordering: userA = min(id), userB = max(id)
      const [a, b] = [fr.fromUserId, fr.toUserId].sort();
      await this.prisma.friendship.upsert({
        where: { userAId_userBId: { userAId: a, userBId: b } },
        create: { userAId: a, userBId: b },
        update: {},
      });
      await this.prisma.notification.create({
        data: {
          userId: fr.fromUserId,
          kind: 'FRIEND_ACCEPTED',
          title: 'Friend request accepted',
          body: 'You are now connected.',
        },
      });
    }
    logger.info({ requestId, accept }, 'friend request handled');
    return { ok: true };
  }

  async listFriends(userId: string) {
    const friends0 = await this.prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      include: {
        a: { include: { profile: true } },
        b: { include: { profile: true } },
      },
    });
    const online = await this.redis.onlineSet(friends0.map((r) => (r.userAId === userId ? r.userBId : r.userAId)));
    return friends0.map((row) => {
      const other = row.userAId === userId ? row.b : row.a;
      return {
        id: other.id,
        username: other.username,
        displayName: other.profile?.displayName ?? other.username,
        avatarHue: other.profile?.avatarHue ?? 210,
        isOnline: online.has(other.id),
      };
    });
  }

  async listPending(userId: string) {
    const rows = await this.prisma.friendRequest.findMany({
      where: { toUserId: userId, status: 'PENDING' },
      include: { from: { include: { profile: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      fromUserId: r.fromUserId,
      fromUsername: r.from.username,
      toUserId: r.toUserId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async removeFriend(userId: string, friendId: string) {
    const [a, b] = [userId, friendId].sort();
    await this.prisma.friendship.deleteMany({ where: { userAId: a, userBId: b } });
    return { ok: true };
  }

  async follow(userId: string, followeeId: string) {
    if (userId === followeeId) throw new BadRequestException('Cannot follow yourself');
    const exists = await this.prisma.follow.findFirst({
      where: { followerId: userId, followeeId },
    });
    if (exists) return exists;
    return this.prisma.follow.create({ data: { followerId: userId, followeeId } });
  }

  async unfollow(userId: string, followeeId: string) {
    await this.prisma.follow.deleteMany({ where: { followerId: userId, followeeId } });
    return { ok: true };
  }

  async listFollowing(userId: string) {
    return this.prisma.follow.findMany({ where: { followerId: userId } });
  }
}
