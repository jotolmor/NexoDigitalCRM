import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}
  async summary(tenantId: string, clinicId: string | null) {
    const scope = { tenantId, ...(clinicId ? { clinicId } : {}) };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const [patients, appointmentsToday, upcoming] = await Promise.all([
      this.prisma.patient.count({ where: scope }),
      this.prisma.appointment.count({ where: { ...scope, startsAt: { gte: today, lt: tomorrow }, status: { not: 'CANCELLED' } } }),
      this.prisma.appointment.findMany({ where: { ...scope, startsAt: { gte: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } }, include: { patient: { select: { firstName: true, lastName: true } } }, orderBy: { startsAt: 'asc' }, take: 5 })
    ]);
    return { patients, appointmentsToday, upcoming };
  }
}
