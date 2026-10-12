import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.service';
import { parseBody } from '../common/zod.pipe';
import { updatePreferencesSchema, updateProfileSchema } from '@bundle/shared';

@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(private prisma: PrismaService) {}

  @Get('me')
  async profile(@Req() req: AuthedRequest) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { profile: true, preferences: true },
    });
    if (!user) throw new BadRequestException('Not found');
    return {
      profile: user.profile
        ? {
            displayName: user.profile.displayName,
            bio: user.profile.bio,
            gender: user.profile.gender,
            avatarHue: user.profile.avatarHue,
            interests: JSON.parse(user.profile.interests),
          }
        : null,
      preferences: user.preferences
        ? {
            seeking: user.preferences.seeking,
            language: user.preferences.language,
            country: user.preferences.country,
            interests: JSON.parse(user.preferences.interests),
            preferVerified: user.preferences.preferVerified,
            chatModeDefault: user.preferences.chatModeDefault,
            messageRetentionDays: user.preferences.messageRetentionDays,
            onlineVisibility: user.preferences.onlineVisibility,
          }
        : null,
    };
  }

  @Post('me')
  async update(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = parseBody(updateProfileSchema, body);
    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.avatarHue !== undefined) data.avatarHue = dto.avatarHue;
    if (dto.interests !== undefined) data.interests = JSON.stringify(dto.interests);
    await this.prisma.userProfile.upsert({
      where: { userId: req.user!.id },
      create: {
        userId: req.user!.id,
        displayName: dto.displayName ?? req.user!.username,
        bio: dto.bio ?? '',
        gender: dto.gender,
        interests: JSON.stringify(dto.interests ?? []),
        avatarHue: dto.avatarHue ?? 210,
      },
      update: data,
    });
    return { ok: true };
  }

  @Post('preferences')
  async updatePreferences(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = parseBody(updatePreferencesSchema, body);
    const data: Record<string, unknown> = {};
    if (dto.seeking !== undefined) data.seeking = dto.seeking;
    if (dto.language !== undefined) data.language = dto.language || null;
    if (dto.country !== undefined) data.country = dto.country || null;
    if (dto.interests !== undefined) data.interests = JSON.stringify(dto.interests);
    if (dto.preferVerified !== undefined) data.preferVerified = dto.preferVerified;
    if (dto.chatModeDefault !== undefined) data.chatModeDefault = dto.chatModeDefault;
    if (dto.messageRetentionDays !== undefined) data.messageRetentionDays = dto.messageRetentionDays;
    if (dto.onlineVisibility !== undefined) data.onlineVisibility = dto.onlineVisibility;
    await this.prisma.userPreference.upsert({
      where: { userId: req.user!.id },
      create: {
        userId: req.user!.id,
        ...(data as { seeking?: string }),
      },
      update: data,
    });
    return { ok: true };
  }
}
