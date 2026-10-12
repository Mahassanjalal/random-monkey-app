import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { JwtVerifier } from './jwt.strategy';

export interface AuthedRequest extends Request {
  user?: { id: string; username: string; role: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private verifier: JwtVerifier) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    const payload = this.verifier.verify(auth.slice(7));
    req.user = { id: payload.sub, username: payload.username, role: payload.role };
    return true;
  }
}
