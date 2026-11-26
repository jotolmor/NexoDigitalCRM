import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SessionUser } from '../common/access';
import { PrismaService } from '../prisma.service';

/**
 * Verifies the token and re-checks the account on every request, so deleted accounts and role changes apply at once.
 * Developer sessions carry another business on purpose (development.service.ts); they stay valid only while
 * the account is still a developer and still owns that business.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();
    let token: SessionUser;
    try { token = this.jwt.verify(header.slice(7)); } catch { throw new UnauthorizedException(); }
    if (!token?.sub) throw new UnauthorizedException();
    const account = await this.prisma.user.findUnique({ where: { id: token.sub }, select: { id: true, tenantId: true, clinicId: true, role: true, isDeveloper: true } });
    if (!account) throw new UnauthorizedException();
    if (token.tenantId === account.tenantId && (token.clinicId ?? null) === account.clinicId) {
      request.user = { sub: account.id, tenantId: account.tenantId, clinicId: account.clinicId, role: account.role };
      return true;
    }
    if (!account.isDeveloper || !token.clinicId) throw new UnauthorizedException();
    const business = await this.prisma.developmentBusiness.findFirst({ where: { developerUserId: account.id, clinicId: token.clinicId, clinic: { tenantId: token.tenantId } }, select: { id: true } });
    if (!business) throw new UnauthorizedException();
    request.user = { sub: account.id, tenantId: token.tenantId, clinicId: token.clinicId, role: token.role };
    return true;
  }
}
