import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { appConfig } from '../config/app.config';

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
}

@Injectable()
export class JwtVerifier {
  constructor(private jwt: JwtService) {}

  verify(token: string): JwtPayload {
    const cfg = appConfig();
    if (!cfg.jwtSecret) throw new UnauthorizedException('Invalid access token');
    try {
      return this.jwt.verify(token, {
        secret: cfg.jwtSecret,
        issuer: 'buddy-api',
        clockTolerance: 30,
      });
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
