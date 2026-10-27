import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireClinic } from '../common/access';
@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}
  async overview(user: SessionUser, from: Date, to: Date) {
    const clinicId = requireClinic(user); const scope = { tenantId: user.tenantId, clinicId, startsAt: { gte: from, lt: to } };
    const [byStatus, byProfessional, newPatients] = await Promise.all([this.prisma.appointment.groupBy({ by: ['status'], where: scope, _count: { _all: true } }), this.prisma.appointment.groupBy({ by: ['professionalId'], where: scope, _count: { _all: true } }), this.prisma.patient.count({ where: { tenantId: user.tenantId, clinicId, createdAt: { gte: from, lt: to } } })]);
    const professionals = await this.prisma.professional.findMany({ where: { tenantId: user.tenantId, clinicId, id: { in: byProfessional.map(x => x.professionalId) } }, select: { id: true, firstName: true, lastName: true } });
    const names = new Map(professionals.map(x => [x.id, x.firstName + ' ' + x.lastName]));
    const totals = Object.fromEntries(byStatus.map(x => [x.status, x._count._all]));
    return { period: { from, to }, newPatients, appointments: { total: byStatus.reduce((n, x) => n + x._count._all, 0), byStatus: totals, completed: totals.COMPLETED ?? 0, cancelled: totals.CANCELLED ?? 0, noShow: totals.NO_SHOW ?? 0 }, professionals: byProfessional.map(x => ({ professionalId: x.professionalId, name: names.get(x.professionalId) ?? 'Sin nombre', appointments: x._count._all })) };
  }
}
