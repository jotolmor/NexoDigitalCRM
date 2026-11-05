import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireClinic, requireWriter } from '../common/access';
import { availableShiftChanges } from './available-shifts';
import { PreparedShift, ShiftChange, ShiftInput, prepareShifts, validShift } from './shift-plan';

@Injectable()
export class SchedulingService {
  constructor(private prisma: PrismaService) {}
  rules(user: SessionUser, professionalId?: string) {
    return this.prisma.scheduleRule.findMany({ where: { tenantId: user.tenantId, clinicId: requireClinic(user), active: true, ...(professionalId ? { professionalId } : {}) }, orderBy: [{ validFrom: 'desc' }, { weekday: 'asc' }, { startsAtMinute: 'asc' }] });
  }
  private async state(user: SessionUser, db: Prisma.TransactionClient | PrismaClient = this.prisma) {
    const where = { tenantId: user.tenantId, clinicId: requireClinic(user), active: true };
    const [records, professionals] = await Promise.all([
      db.scheduleRule.findMany({ where }),
      db.professional.findMany({ where, select: { id: true, firstName: true, lastName: true, specialty: true } })
    ]);
    return { records, professionals };
  }
  async preview(user: SessionUser, changes: unknown) {
    requireWriter(user);
    const { records, professionals } = await this.state(user);
    return prepareShifts(changes, records, professionals);
  }
  async previewAvailable(user: SessionUser, changes: unknown) {
    requireWriter(user);
    const { records, professionals } = await this.state(user);
    return availableShiftChanges(changes, records, professionals);
  }
  async apply(user: SessionUser, changes: ShiftChange[] | PreparedShift[], checkBefore = false) {
    const clinicId = requireWriter(user);
    try {
      return await this.prisma.$transaction(async tx => {
        const { records, professionals } = await this.state(user, tx);
        const prepared = prepareShifts(changes, records, professionals, checkBefore);
        const results = [];
        for (const change of prepared) {
          const where = { id: change.ruleId, tenantId: user.tenantId, clinicId, active: true };
          const data = change.rule ? { ...change.rule, validFrom: new Date(change.rule.validFrom), validTo: new Date(change.rule.validTo) } : { active: false };
          if (change.kind === 'create') results.push(await tx.scheduleRule.create({ data: { ...change.rule!, tenantId: user.tenantId, clinicId, validFrom: new Date(change.rule!.validFrom), validTo: new Date(change.rule!.validTo) } }));
          else {
            const updated = await tx.scheduleRule.updateMany({ where, data });
            if (updated.count !== 1) throw new ConflictException('El turno cambió. Actualiza los datos antes de continuar.');
            results.push(await tx.scheduleRule.findFirstOrThrow({ where: { id: change.ruleId, tenantId: user.tenantId, clinicId } }));
          }
        }
        return results;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException('Otra persona está modificando los turnos. Actualiza y vuelve a preparar el cambio.');
      throw error;
    }
  }
  async addRule(user: SessionUser, input: ShiftInput) {
    const rule = validShift(input);
    return (await this.apply(user, [{ kind: 'create', rule }]))[0];
  }
  async updateRule(user: SessionUser, id: string, input: ShiftInput) {
    const rule = validShift(input);
    return (await this.apply(user, [{ kind: 'update', ruleId: id, rule }]))[0];
  }
  async removeRule(user: SessionUser, id: string) { return (await this.apply(user, [{ kind: 'remove', ruleId: id }]))[0]; }
  async addTimeOff(user: SessionUser, x: { professionalId: string; startsAt: string; endsAt: string; reason?: string }) {
    const clinicId = requireWriter(user);
    const startsAt = new Date(x.startsAt), endsAt = new Date(x.endsAt);
    if (!(startsAt < endsAt)) throw new ConflictException('Ausencia no válida');
    const professional = await this.prisma.professional.findFirst({ where: { id: x.professionalId, tenantId: user.tenantId, clinicId } });
    if (!professional) throw new NotFoundException('Profesional no encontrado');
    return this.prisma.timeOff.create({ data: { tenantId: user.tenantId, clinicId, professionalId: x.professionalId, startsAt, endsAt, reason: x.reason } });
  }
}
