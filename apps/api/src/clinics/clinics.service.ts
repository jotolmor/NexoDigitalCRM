import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireWriter } from '../common/access';
@Injectable()
export class ClinicsService {
  constructor(private prisma: PrismaService) {}
  async current(tenantId: string, clinicId: string | null) {
    if (!clinicId) throw new NotFoundException('No hay clínica asignada');
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    return clinic;
  }
  async update(user: SessionUser, address: string | null) {
    const clinicId = requireWriter(user);
    const result = await this.prisma.clinic.updateMany({ where: { id: clinicId, tenantId: user.tenantId }, data: { address: address?.trim() || null } });
    if (!result.count) throw new NotFoundException('Clínica no encontrada');
    return this.prisma.clinic.findFirstOrThrow({ where: { id: clinicId, tenantId: user.tenantId } });
  }
}
