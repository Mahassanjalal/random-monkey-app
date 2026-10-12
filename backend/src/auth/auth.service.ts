import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { appConfig } from '../config/app.config';
import { logger } from '../common/logger';
import { parseBody } from '../common/zod.pipe';
import {
  loginSchema,
  registerSchema,
  type AuthResponse,
  type SessionUserDto,
  type TokenPair,
} from '@bundle/shared';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus } from '@bundle/shared';

const MIN_AGE = 18;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newOpaqueToken(): string {
  return randomBytes(48).toString('base64url');
}

function toSessionUser(u: {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  ageAssurance: string;
  onboardingStep: number | null;
  createdAt: Date;
}): SessionUserDto {
  const verified = u.ageAssurance === 'VERIFIED';
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: (u.role as SessionUserDto['role']) ?? 'USER',
    status: u.status,
    ageAssurance: (u.ageAssurance as SessionUserDto['ageAssurance']) ?? 'UNKNOWN',
    isAdultVerified: verified,
    mustCompleteAgeGate: !verified && u.ageAssurance === 'UNKNOWN',
    onboardingStep: u.onboardingStep,
    createdAt: u.createdAt.toISOString(),
  };
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  private get cfg() {
    return appConfig();
  }

  private signAccessToken(user: { id: string; username: string; role: string }): string {
    return this.jwt.sign(
      { sub: user.id, username: user.username, role: user.role },
      { secret: this.cfg.jwtSecret, expiresIn: this.cfg.accessTokenTtlSec, issuer: 'buddy-api' },
    );
  }

  async issueTokens(
    user: { id: string; username: string; role: string },
    meta: { userAgent?: string; ipHash?: string },
  ): Promise<TokenPair> {
    const accessToken = this.signAccessToken(user);
    const refreshToken = newOpaqueToken();
    const familyId = randomBytes(12).toString('hex');
    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashToken(refreshToken),
        familyId,
        userAgent: (meta.userAgent ?? '').slice(0, 250),
        ipHash: (meta.ipHash ?? '').slice(0, 64),
        expiresAt: new Date(Date.now() + this.cfg.refreshTokenTtlSec * 1000),
      },
    });
    return { accessToken, refreshToken };
  }

  private async checkStatus(user: {
    id: string;
    status: string;
    suspendedUntil: Date | null;
  }) {
    if (user.status === 'BANNED') throw new ForbiddenException('Account banned');
    if (user.status === 'SUSPENDED') {
      if (!user.suspendedUntil || user.suspendedUntil > new Date()) {
        throw new ForbiddenException('Account suspended');
      }
      // Suspension expired: reactivate.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE', suspendedUntil: null },
      });
    }
  }

  async register(dto: unknown, meta: { userAgent?: string; ipHash?: string }): Promise<AuthResponse> {
    const data = parseBody(registerSchema, dto);
    // Age gate: strictly 18+ at registration time. Self-declared only at this stage;
    // real deployments require an age-assurance provider (docs/age-assurance.md).
    const birth = new Date(data.birthDate + 'T00:00:00Z');
    const now = new Date();
    let age = now.getUTCFullYear() - birth.getUTCFullYear();
    const m = now.getUTCMonth() - birth.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
    if (age < MIN_AGE) {
      throw new BadRequestException('You must be at least 18 years old to use this service.');
    }
    const usernameTaken = await this.prisma.user.findUnique({ where: { username: data.username } });
    if (usernameTaken && !usernameTaken.deletedAt) {
      throw new ConflictException('Username already taken');
    }
    if (usernameTaken && usernameTaken.deletedAt) {
      // rare case: allow re-use of deleted accounts' usernames by suffixing -1
      // (handled by unique index — we instead fail; deletion keeps the username)
      throw new ConflictException('Username already taken');
    }
    const emailTaken = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (emailTaken && !emailTaken.deletedAt) throw new ConflictException('Email already registered');
    if (emailTaken && emailTaken.deletedAt) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });
    // authKey is an opaque integration secret — never predictable, never derived from username.
    const authKey = `authkey:${randomBytes(24).toString('base64url')}`;
    const user = await this.prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        passwordHash,
        birthDate: data.birthDate,
        role: 'USER',
        status: AccountStatus.ACTIVE,
        ageAssurance: 'SELF_DECLARED',
        authKey,
        acceptedTermsAt: new Date(data.acceptedTermsAt),
        profile: { create: { displayName: data.username, interests: '[]' } },
        preferences: { create: { seeking: 'EVERYONE' } },
      },
    });
    logger.info({ userId: user.id }, 'user registered');
    const tokens = await this.issueTokens(user, meta);
    return { user: toSessionUser(user), tokens };
  }

  async login(dto: unknown, meta: { userAgent?: string; ipHash?: string }): Promise<AuthResponse> {
    const data = parseBody(loginSchema, dto);
    const key = data.usernameOrEmail.includes('@')
      ? { email: data.usernameOrEmail }
      : { username: data.usernameOrEmail };
    const user = await this.prisma.user.findFirst({ where: { ...key, deletedAt: null } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    await this.checkStatus(user);
    let ok = false;
    if (user.passwordHash && user.passwordHash.length > 0) {
      try {
        ok = await argon2.verify(user.passwordHash, data.password);
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      // auth-key login is a dev/test affordance only — never in production.
      const allowAuthKey = this.cfg.env !== 'production';
      if (allowAuthKey && data.password.startsWith('authkey:') && user.authKey === data.password)
        ok = true;
    }
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const tokens = await this.issueTokens(user, meta);
    logger.info({ userId: user.id }, 'user login');
    return { user: toSessionUser(user), tokens };
  }

  async rotateRefresh(
    refreshToken: string,
    meta: { userAgent?: string; ipHash?: string },
  ): Promise<AuthResponse> {
    if (!refreshToken || refreshToken.length < 20) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const hash = hashToken(refreshToken);
    const session = await this.prisma.userSession.findFirst({ where: { refreshTokenHash: hash } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      // Possible token reuse after rotation — revoke the whole family as theft mitigation.
      if (session) {
        await this.prisma.userSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        logger.warn({ familyId: session.familyId }, 'refresh token reuse; family revoked');
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.deletedAt) throw new UnauthorizedException('Session user missing');
    await this.checkStatus(user);
    const newSession = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashToken(newOpaqueToken()),
        rotatedFrom: session.id,
        familyId: session.familyId,
        userAgent: (meta.userAgent ?? '').slice(0, 250),
        ipHash: (meta.ipHash ?? '').slice(0, 64),
        expiresAt: new Date(Date.now() + this.cfg.refreshTokenTtlSec * 1000),
      },
    });
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    const accessToken = this.signAccessToken(user);
    const newRefresh = newOpaqueToken();
    await this.prisma.userSession.update({
      where: { id: newSession.id },
      data: { refreshTokenHash: hashToken(newRefresh) },
    });
    return {
      user: toSessionUser(user),
      tokens: { accessToken, refreshToken: newRefresh },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const hash = hashToken(refreshToken);
    await this.prisma.userSession.updateMany({ where: { refreshTokenHash: hash }, data: { revokedAt: new Date() } });
  }

  async me(userId: string): Promise<SessionUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new UnauthorizedException();
    return toSessionUser(user);
  }
}
