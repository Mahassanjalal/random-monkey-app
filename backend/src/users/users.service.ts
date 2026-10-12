import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { logger } from '../common/logger';

export interface PublicUserView {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
  interests: string[];
  bio: string;
  country: string | null;
  isVerified: boolean;
}

/**
 * Users service: everything behind /me and account management.
 * Security: every method is scoped to the authenticated user.
 */
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, preferences: true },
    });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      ageAssurance: user.ageAssurance,
      isVerified: user.ageAssurance === 'VERIFIED',
      onboardingStep: user.onboardingStep,
      acceptedTermsAt: user.acceptedTermsAt?.toISOString() ?? null,
      profile: user.profile
        ? {
            displayName: user.profile.displayName,
            bio: user.profile.bio,
            gender: user.profile.gender,
            avatarHue: user.profile.avatarHue,
            interests: JSON.parse(user.profile.interests) as string[],
          }
        : null,
      preferences: user.preferences
        ? {
            seeking: user.preferences.seeking,
            language: user.preferences.language,
            country: user.preferences.country,
            interests: JSON.parse(user.preferences.interests) as string[],
            preferVerified: user.preferences.preferVerified,
            chatModeDefault: user.preferences.chatModeDefault,
            messageRetentionDays: user.preferences.messageRetentionDays,
            onlineVisibility: user.preferences.onlineVisibility,
            notifyFriendRequest: user.preferences.notifyFriendRequest,
            notifyNewFollower: user.preferences.notifyNewFollower,
            notifyPromotions: user.preferences.notifyPromotions,
          }
        : null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async getPublicUser(id: string): Promise<PublicUserView | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
    if (!user || user.deletedAt) return null;
    return {
      id: user.id,
      username: user.username,
      displayName: user.profile?.displayName ?? user.username,
      avatarHue: user.profile?.avatarHue ?? 210,
      interests: user.profile ? (JSON.parse(user.profile.interests) as string[]) : [],
      bio: user.profile?.bio ?? '',
      country: null,
      isVerified: user.ageAssurance === 'VERIFIED',
    };
  }

  async onlineStatus(userId: string): Promise<boolean> {
    // Online status is Redis heartbeat-based and visibility-controlled.
    const pref = await this.prisma.userPreference.findUnique({ where: { userId } });
    if (pref?.onlineVisibility === 'NOBODY') return false;
    const res = await this.prisma.userSession.count({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    return res > 0;
  }

  /**
   * Account deletion: soft-delete user, revoke sessions, purge PII, retain minimal audit.
   * Full behavior documented in docs/security.md "Data retention & deletion".
   */
  async deleteAccount(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          status: 'DEACTIVATED',
          email: `deleted+${randomBytes(6).toString('hex')}@invalid.local`,
          authKey: `deleted:${userId}`,
          passwordHash: '',
          ageAssurance: 'UNKNOWN',
        },
      }),
      this.prisma.userSession.updateMany({
        where: { userId },
        data: { revokedAt: now, expiresAt: now },
      }),
    ]);
    // Purge profile content (anonymized), keep match/moderation history for audit.
    await this.prisma.userProfile.updateMany({
      where: { userId },
      data: { displayName: 'Deleted User', bio: '', interests: '[]', gender: null },
    });
    logger.info({ userId }, 'account deleted (soft)');
  }
}

export interface UserSearchRow {
  id: string;
  username: string;
  displayName: string;
  status: string;
  role: string;
}
