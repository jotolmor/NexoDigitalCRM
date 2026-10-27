import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
@Injectable()
export class ClinicsService {
  constructor(private prisma: PrismaService) {}
  async current(tenantId: string, clinicId: string | null) {
    if (!clinicId) throw new NotFoundException('No hay clínica asignada');
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } });
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    return clinic;
  }
}
