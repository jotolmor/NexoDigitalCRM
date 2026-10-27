import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireClinic, requireWriter } from '../common/access';
@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}
  list(user: SessionUser, search?: string) {
    const clinicId = requireClinic(user); const needle = search?.trim();
    return this.prisma.patient.findMany({ where: { tenantId: user.tenantId, clinicId, ...(needle ? { OR: [{ firstName: { contains: needle, mode: 'insensitive' } }, { lastName: { contains: needle, mode: 'insensitive' } }, { email: { contains: needle, mode: 'insensitive' } }] } : {}) }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
  }
  create(user: SessionUser, input: { firstName: string; lastName: string; email?: string; phone?: string }) {
    const clinicId = requireWriter(user); return this.prisma.patient.create({ data: { tenantId: user.tenantId, clinicId, ...input } });
  }
}
