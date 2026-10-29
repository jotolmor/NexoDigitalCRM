import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireClinic, requireWriter } from '../common/access';
@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}
  listProfessionals(user: SessionUser) { const clinicId = requireClinic(user); return this.prisma.professional.findMany({ where: { tenantId: user.tenantId, clinicId }, include: { services: { include: { service: true } } }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }); }
  createProfessional(user: SessionUser, input: { firstName: string; lastName: string; specialty: string; email?: string; phone?: string }) { const clinicId = requireWriter(user); return this.prisma.professional.create({ data: { tenantId: user.tenantId, clinicId, ...input } }); }
  listServices(user: SessionUser) { const clinicId = requireClinic(user); return this.prisma.service.findMany({ where: { tenantId: user.tenantId, clinicId }, orderBy: { name: 'asc' } }); }
  createService(user: SessionUser, input: { name: string; description?: string; durationMinutes: number; priceEuros?: number }) { const clinicId = requireWriter(user); return this.prisma.service.create({ data: { tenantId: user.tenantId, clinicId, ...input } }); }
  async assignService(user: SessionUser, professionalId: string, serviceId: string) {
    const clinicId = requireWriter(user);
    const [professional, service] = await Promise.all([this.prisma.professional.findFirst({ where: { id: professionalId, tenantId: user.tenantId, clinicId } }), this.prisma.service.findFirst({ where: { id: serviceId, tenantId: user.tenantId, clinicId } })]);
    if (!professional || !service) throw new NotFoundException('Profesional o servicio no encontrado');
    return this.prisma.professionalService.upsert({ where: { professionalId_serviceId: { professionalId, serviceId } }, update: {}, create: { professionalId, serviceId } });
  }
}
