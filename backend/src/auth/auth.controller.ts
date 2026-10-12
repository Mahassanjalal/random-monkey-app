import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { JwtAuthGuard, type AuthedRequest } from './jwt.guard';

function meta(req: Request): { userAgent?: string; ipHash?: string } {
  const rawIp = req.ip ?? '';
  // Store only a salted hash, never the raw IP (PII minimization).
  const ipHash = rawIp
    ? createHash('sha256').update(rawIp).digest('hex').slice(0, 64)
    : '';
  return {
    userAgent: (req.headers['user-agent'] as string) ?? '',
    ipHash,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  async register(@Body() body: unknown, @Req() req: Request) {
    return this.auth.register(body, meta(req));
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request) {
    return this.auth.login(body, meta(req));
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: unknown, @Req() req: Request) {
    const dto = body as { refreshToken?: string };
    return this.auth.rotateRefresh(dto.refreshToken ?? '', meta(req));
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() body: unknown) {
    const dto = body as { refreshToken?: string };
    await this.auth.logout(dto.refreshToken ?? '');
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: AuthedRequest) {
    return this.auth.me(req.user!.id);
  }

  // OAuth providers (Google/GitHub) are configured via env; without credentials the
  // frontend hides the entry points and this endpoint reports them as unavailable.
  @Get('oauth-providers')
  oauthProviders() {
    return {
      providers: [
        { id: 'google', configured: !!process.env.OAUTH_GOOGLE_CLIENT_ID },
        { id: 'github', configured: !!process.env.OAUTH_GITHUB_CLIENT_ID },
      ].filter((p) => p.configured),
    };
  }
}
