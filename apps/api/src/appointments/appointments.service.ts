import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireClinic, requireWriter } from '../common/access';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}
  list(user: SessionUser) { const clinicId = requireClinic(user); return this.prisma.appointment.findMany({ where: { tenantId: user.tenantId, clinicId }, include: { patient: true, professional: true }, orderBy: { startsAt: 'asc' } }); }
  async create(user: SessionUser, input: { patientId: string; professionalId: string; roomId?: string; startsAt: string; endsAt: string }) {
    const clinicId = requireWriter(user); const appointment = await this.reserve(user.tenantId, clinicId, input); await this.audit.write({ tenantId: user.tenantId, clinicId, actorUserId: user.sub, action: 'appointment.created', entityType: 'Appointment', entityId: appointment.id }); return appointment;
  }
  async reschedule(user: SessionUser, id: string, input: { startsAt: string; endsAt: string; professionalId?: string; roomId?: string }) {
    const clinicId = requireWriter(user);
    const appointment = await this.prisma.appointment.findFirst({ where: { id, tenantId: user.tenantId, clinicId } });
    if (!appointment) throw new NotFoundException('Cita no encontrada');
    if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appointment.status)) throw new ConflictException('Esta cita no puede reprogramarse');
    const updated = await this.reserve(user.tenantId, clinicId, { patientId: appointment.patientId, professionalId: input.professionalId ?? appointment.professionalId, roomId: input.roomId ?? appointment.roomId ?? undefined, startsAt: input.startsAt, endsAt: input.endsAt }, id); await this.audit.write({ tenantId: user.tenantId, clinicId, actorUserId: user.sub, action: 'appointment.rescheduled', entityType: 'Appointment', entityId: id }); return updated;
  }
  async updateStatus(user: SessionUser, id: string, status: AppointmentStatus) {
    const clinicId = requireWriter(user);
    const result = await this.prisma.appointment.updateMany({ where: { id, tenantId: user.tenantId, clinicId }, data: { status } });
    if (!result.count) throw new NotFoundException('Cita no encontrada');
    const updated = await this.prisma.appointment.findUniqueOrThrow({ where: { id } }); await this.audit.write({ tenantId: user.tenantId, clinicId, actorUserId: user.sub, action: 'appointment.status_changed', entityType: 'Appointment', entityId: id, metadata: { status } }); return updated;
  }
  private async reserve(tenantId: string, clinicId: string, input: { patientId: string; professionalId: string; roomId?: string; startsAt: string; endsAt: string }, replaceId?: string) {
    const startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
    if (!(startsAt < endsAt)) throw new ConflictException('El intervalo de la cita no es válido');
    return this.prisma.$transaction(async tx => {
      const [patient, professional] = await Promise.all([tx.patient.findFirst({ where: { id: input.patientId, tenantId, clinicId } }), tx.professional.findFirst({ where: { id: input.professionalId, tenantId, clinicId, active: true } })]);
      if (!patient || !professional) throw new NotFoundException('Paciente o profesional no encontrado');
      const room = input.roomId ? await tx.room.findFirst({ where: { id: input.roomId, tenantId, clinicId, active: true } }) : null;
      if (input.roomId && !room) throw new NotFoundException('Gabinete no encontrado');
      const [clinic, rules, timeOff] = await Promise.all([
        tx.clinic.findFirstOrThrow({ where: { id: clinicId, tenantId }, select: { timezone: true } }),
        tx.scheduleRule.findMany({ where: { tenantId, clinicId, professionalId: professional.id, active: true } }),
        tx.timeOff.findFirst({ where: { tenantId, clinicId, professionalId: professional.id, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } })
      ]);
      if (timeOff) throw new ConflictException('El profesional no está disponible por una ausencia');
      if (rules.length) {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: clinic.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(startsAt);
        const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        const weekday = weekdays[parts.find(x => x.type === 'weekday')?.value ?? ''];
        const hour = Number(parts.find(x => x.type === 'hour')?.value ?? 0), minute = Number(parts.find(x => x.type === 'minute')?.value ?? 0);
        const localStart = hour * 60 + minute;
        const localEnd = localStart + Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);
        if (!rules.some(x => x.weekday === weekday && x.startsAtMinute <= localStart && x.endsAtMinute >= localEnd)) throw new ConflictException('La cita queda fuera del horario del profesional');
      }
      const clash = await tx.appointment.findFirst({ where: { tenantId, clinicId, professionalId: professional.id, ...(replaceId ? { id: { not: replaceId } } : {}), status: { in: ['SCHEDULED', 'CONFIRMED'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
      if (clash) throw new ConflictException('El profesional ya tiene una cita en ese horario');
      if (room && await tx.appointment.findFirst({ where: { tenantId, clinicId, roomId: room.id, ...(replaceId ? { id: { not: replaceId } } : {}), status: { in: ['SCHEDULED', 'CONFIRMED'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } })) throw new ConflictException('El gabinete ya está reservado en ese horario');
      if (replaceId) return tx.appointment.update({ where: { id: replaceId }, data: { professionalId: professional.id, roomId: room?.id, startsAt, endsAt, status: 'SCHEDULED' } });
      const appointment = await tx.appointment.create({ data: { tenantId, clinicId, patientId: patient.id, professionalId: professional.id, roomId: room?.id, startsAt, endsAt } });
      await tx.automationEvent.create({ data: { tenantId, clinicId, type: 'appointment.created', payload: { appointmentId: appointment.id, patientId: patient.id, professionalId: professional.id, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } } });
      return appointment;
    });
  }
}
