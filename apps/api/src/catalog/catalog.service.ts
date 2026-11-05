import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireClinic, requireWriter } from '../common/access';
type ProfessionalInput = { firstName: string; lastName: string; specialty: string; email?: string | null; phone?: string | null; dni?: string | null; nif?: string | null };
@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}
  listProfessionals(user: SessionUser) { const clinicId = requireClinic(user); return this.prisma.professional.findMany({ where: { tenantId: user.tenantId, clinicId }, include: { services: { include: { service: true } } }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }); }
  createProfessional(user: SessionUser, input: ProfessionalInput) { const clinicId = requireWriter(user); return this.prisma.professional.create({ data: { tenantId: user.tenantId, clinicId, ...this.normalizeProfessional(input) } }); }
  async updateProfessional(user: SessionUser, id: string, input: ProfessionalInput) {
    const clinicId = requireWriter(user);
    const result = await this.prisma.professional.updateMany({ where: { id, tenantId: user.tenantId, clinicId }, data: this.normalizeProfessional(input) });
    if (!result.count) throw new NotFoundException('Profesional no encontrado');
    return this.prisma.professional.findFirstOrThrow({ where: { id, tenantId: user.tenantId, clinicId }, include: { services: { include: { service: true } } } });
  }
  private normalizeProfessional(input: ProfessionalInput) {
    const data = { ...input };
    for (const field of ['dni', 'nif'] as const) {
      const value = input[field];
      if (value === undefined) { delete data[field]; continue; }
      if (value === null) continue;
      const normalized = value.replace(/[\s.-]/g, '').toUpperCase();
      if (!/^[A-Z0-9]{3,20}$/.test(normalized)) throw new BadRequestException(`Revisa el ${field.toUpperCase()}: utiliza entre 3 y 20 letras o números.`);
      data[field] = normalized;
    }
    return data;
  }
  listServices(user: SessionUser) { const clinicId = requireClinic(user); return this.prisma.service.findMany({ where: { tenantId: user.tenantId, clinicId }, orderBy: { name: 'asc' } }); }
  createService(user: SessionUser, input: { profession?: string | null; specialty?: string | null; name: string; description?: string; durationMinutes: number; priceEuros?: number }) { const clinicId = requireWriter(user); return this.prisma.service.create({ data: { tenantId: user.tenantId, clinicId, ...input } }); }
  async updateService(user: SessionUser, id: string, input: { profession?: string | null; specialty?: string | null; name: string; description?: string | null; durationMinutes?: number; priceEuros?: number | null }) {
    const clinicId = requireWriter(user);
    const result = await this.prisma.service.updateMany({ where: { id, tenantId: user.tenantId, clinicId }, data: input });
    if (!result.count) throw new NotFoundException('Tratamiento no encontrado');
    return this.prisma.service.findFirstOrThrow({ where: { id, tenantId: user.tenantId, clinicId } });
  }
  async updateServiceDuration(user: SessionUser, id: string, durationMinutes: number) {
    const clinicId = requireWriter(user);
    const result = await this.prisma.service.updateMany({ where: { id, tenantId: user.tenantId, clinicId }, data: { durationMinutes } });
    if (!result.count) throw new NotFoundException('Tratamiento no encontrado');
    return this.prisma.service.findFirstOrThrow({ where: { id, tenantId: user.tenantId, clinicId } });
  }
  async assignService(user: SessionUser, professionalId: string, serviceId: string) {
    const clinicId = requireWriter(user);
    const [professional, service] = await Promise.all([this.prisma.professional.findFirst({ where: { id: professionalId, tenantId: user.tenantId, clinicId } }), this.prisma.service.findFirst({ where: { id: serviceId, tenantId: user.tenantId, clinicId } })]);
    if (!professional || !service) throw new NotFoundException('Profesional o servicio no encontrado');
    return this.prisma.professionalService.upsert({ where: { professionalId_serviceId: { professionalId, serviceId } }, update: {}, create: { professionalId, serviceId } });
  }
}
