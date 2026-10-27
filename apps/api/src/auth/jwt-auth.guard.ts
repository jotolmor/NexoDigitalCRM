import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest(); const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();
    try { request.user = this.jwt.verify(header.slice(7), { secret: process.env.JWT_SECRET ?? 'development-only-secret-change-before-deployment' }); return true; } catch { throw new UnauthorizedException(); }
  }
}
