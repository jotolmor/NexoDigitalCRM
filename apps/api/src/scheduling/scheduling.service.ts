import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireClinic, requireWriter } from '../common/access';

@Injectable()
export class SchedulingService {
  constructor(private prisma: PrismaService) {}

  rules(user: SessionUser, professionalId: string) {
    const clinicId = requireClinic(user);
    return this.prisma.scheduleRule.findMany({
      where: { tenantId: user.tenantId, clinicId, professionalId },
      orderBy: [{ validFrom: 'desc' }, { weekday: 'asc' }, { startsAtMinute: 'asc' }]
    });
  }

  async addRule(user: SessionUser, x: { professionalId: string; weekday: number; startsAtMinute: number; endsAtMinute: number; validFrom: string; validTo: string }) {
    const clinicId = requireWriter(user);
    if (x.weekday < 0 || x.weekday > 6 || x.startsAtMinute < 0 || x.endsAtMinute > 1440 || x.startsAtMinute >= x.endsAtMinute || x.validFrom > x.validTo) {
      throw new ConflictException('Horario o periodo de vigencia no válido');
    }
    const professional = await this.prisma.professional.findFirst({ where: { id: x.professionalId, tenantId: user.tenantId, clinicId } });
    if (!professional) throw new NotFoundException('Profesional no encontrado');
    return this.prisma.scheduleRule.create({
      data: {
        tenantId: user.tenantId,
        clinicId,
        professionalId: x.professionalId,
        weekday: x.weekday,
        startsAtMinute: x.startsAtMinute,
        endsAtMinute: x.endsAtMinute,
        validFrom: new Date(x.validFrom),
        validTo: new Date(x.validTo)
      }
    });
  }

  async addTimeOff(user: SessionUser, x: { professionalId: string; startsAt: string; endsAt: string; reason?: string }) {
    const clinicId = requireWriter(user);
    const startsAt = new Date(x.startsAt), endsAt = new Date(x.endsAt);
    if (!(startsAt < endsAt)) throw new ConflictException('Ausencia no válida');
    const professional = await this.prisma.professional.findFirst({ where: { id: x.professionalId, tenantId: user.tenantId, clinicId } });
    if (!professional) throw new NotFoundException('Profesional no encontrado');
    return this.prisma.timeOff.create({ data: { tenantId: user.tenantId, clinicId, professionalId: x.professionalId, startsAt, endsAt, reason: x.reason } });
  }
}
