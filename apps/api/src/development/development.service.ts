import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { SessionUser } from '../common/access';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DevelopmentService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private auth: AuthService) {}
  private async account(session: SessionUser) {
    const user = session.sub ? await this.prisma.user.findUnique({ where: { id: session.sub } }) : null;
    if (!user?.isDeveloper || user.role !== 'CLINIC_OWNER') throw new ForbiddenException('Esta función requiere una cuenta de desarrollo habilitada en el servidor.');
    return user;
  }
  async list(session: SessionUser) {
    const user = await this.account(session);
    const records = await this.prisma.developmentBusiness.findMany({
      where: { developerUserId: user.id }, orderBy: { createdAt: 'asc' },
      select: { clinic: { select: { id: true, name: true, businessType: true, specialty: true } } },
    });
    return records.map(record => record.clinic);
  }
  async create(session: SessionUser, input: { name: string; businessType: string; specialty: string; address?: string }) {
    const user = await this.account(session);
    const clinic = await this.prisma.$transaction(async tx => {
      const tenant = await tx.tenant.create({ data: { name: input.name.trim(), slug: 'dev-' + randomUUID() } });
      const clinic = await tx.clinic.create({ data: {
        tenantId: tenant.id, name: input.name.trim(), businessType: input.businessType,
        specialty: input.specialty.trim(), address: input.address?.trim() || null,
        terminology: this.auth.terminologyFor(input.businessType),
      } });
      await tx.developmentBusiness.create({ data: { developerUserId: user.id, clinicId: clinic.id } });
      return clinic;
    });
    return this.session(user, clinic);
  }
  async select(session: SessionUser, clinicId: string) {
    const user = await this.account(session);
    const membership = await this.prisma.developmentBusiness.findFirst({ where: { developerUserId: user.id, clinicId }, include: { clinic: true } });
    if (!membership) throw new NotFoundException('Ese negocio no pertenece a tu espacio de desarrollo.');
    return this.session(user, membership.clinic);
  }
  private session(user: { id: string; email: string; name: string }, clinic: { id: string; tenantId: string }) {
    const payload = { sub: user.id, tenantId: clinic.tenantId, clinicId: clinic.id, role: 'CLINIC_OWNER' };
    return {
      accessToken: this.jwt.sign(payload),
      user: { id: user.id, email: user.email, name: user.name, tenantId: clinic.tenantId, clinicId: clinic.id, role: 'CLINIC_OWNER', isDeveloper: true },
    };
  }
}
