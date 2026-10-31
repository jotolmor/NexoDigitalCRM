import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireClinic, requireWriter } from '../common/access';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}
  list(user: SessionUser) { const clinicId = requireClinic(user); return this.prisma.appointment.findMany({ where: { tenantId: user.tenantId, clinicId }, include: { patient: true, professional: true, service: true, room: true }, orderBy: { startsAt: 'asc' } }); }
  async availability(user: SessionUser, professionalId: string, serviceId: string) {
    const clinicId = requireClinic(user);
    const professional = await this.prisma.professional.findFirst({ where: { id: professionalId, tenantId: user.tenantId, clinicId, active: true }, select: { id: true } });
    if (!professional) throw new NotFoundException('Profesional no encontrado');
    const service = await this.prisma.service.findFirst({ where: { id: serviceId, tenantId: user.tenantId, clinicId, active: true }, select: { id: true, name: true, durationMinutes: true } });
    if (!service) throw new NotFoundException('Tratamiento no encontrado');
    const durationMinutes = service.durationMinutes;
    const clinic = await this.prisma.clinic.findFirstOrThrow({ where: { id: clinicId, tenantId: user.tenantId }, select: { timezone: true } });
    const from = new Date(Math.ceil(Date.now() / 900000) * 900000); const until = new Date(from.getTime() + 45 * 86400000);
    const [rules, appointments, timeOffs] = await Promise.all([
      this.prisma.scheduleRule.findMany({ where: { tenantId: user.tenantId, clinicId, professionalId, active: true } }),
      this.prisma.appointment.findMany({ where: { tenantId: user.tenantId, clinicId, professionalId, status: { in: ['SCHEDULED', 'CONFIRMED'] }, startsAt: { lt: until }, endsAt: { gt: from } }, select: { startsAt: true, endsAt: true } }),
      this.prisma.timeOff.findMany({ where: { tenantId: user.tenantId, clinicId, professionalId, startsAt: { lt: until }, endsAt: { gt: from } }, select: { startsAt: true, endsAt: true } })
    ]);
    const slots: { startsAt: string; endsAt: string; localStart: string; localEnd: string }[] = [];
    for (let timestamp = from.getTime(); timestamp + durationMinutes * 60000 <= until.getTime() && slots.length < 12; timestamp += 15 * 60000) {
      const startsAt = new Date(timestamp), endsAt = new Date(timestamp + durationMinutes * 60000);
      const localStart = this.localParts(startsAt, clinic.timezone), localEnd = this.localParts(endsAt, clinic.timezone);
      const weekday = new Date(`${localStart.date}T00:00:00Z`).getUTCDay();
      if (localStart.date !== localEnd.date || weekday < 1 || weekday > 5 || !rules.some(rule => rule.weekday === weekday && rule.validFrom.toISOString().slice(0, 10) <= localStart.date && rule.validTo.toISOString().slice(0, 10) >= localStart.date && rule.startsAtMinute <= localStart.minute && rule.endsAtMinute >= localEnd.minute)) continue;
      if (appointments.some(item => item.startsAt < endsAt && item.endsAt > startsAt) || timeOffs.some(item => item.startsAt < endsAt && item.endsAt > startsAt)) continue;
      slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), localStart: `${localStart.date} ${this.formatMinute(localStart.minute)}`, localEnd: this.formatMinute(localEnd.minute) });
    }
    return { professionalId, service, durationMinutes, timezone: clinic.timezone, firstAvailable: slots[0] ?? null, slots, searchedUntil: until.toISOString() };
  }
  async create(user: SessionUser, input: { patientId: string; professionalId: string; serviceId?: string; roomId?: string; startsAt: string; endsAt: string }) {
    const clinicId = requireWriter(user); const appointment = await this.reserve(user.tenantId, clinicId, input); await this.audit.write({ tenantId: user.tenantId, clinicId, actorUserId: user.sub, action: 'appointment.created', entityType: 'Appointment', entityId: appointment.id }); return appointment;
  }
  async reschedule(user: SessionUser, id: string, input: { startsAt: string; endsAt: string; patientId?: string; professionalId?: string; serviceId?: string; roomId?: string }) {
    const clinicId = requireWriter(user);
    const appointment = await this.prisma.appointment.findFirst({ where: { id, tenantId: user.tenantId, clinicId } });
    if (!appointment) throw new NotFoundException('Cita no encontrada');
    if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appointment.status)) throw new ConflictException('Esta cita no puede reprogramarse');
    const updated = await this.reserve(user.tenantId, clinicId, { patientId: input.patientId ?? appointment.patientId, professionalId: input.professionalId ?? appointment.professionalId, serviceId: input.serviceId ?? appointment.serviceId ?? undefined, roomId: input.roomId ?? appointment.roomId ?? undefined, startsAt: input.startsAt, endsAt: input.endsAt }, id); await this.audit.write({ tenantId: user.tenantId, clinicId, actorUserId: user.sub, action: 'appointment.rescheduled', entityType: 'Appointment', entityId: id }); return updated;
  }
  async updateStatus(user: SessionUser, id: string, status: AppointmentStatus) {
    const clinicId = requireWriter(user);
    const result = await this.prisma.appointment.updateMany({ where: { id, tenantId: user.tenantId, clinicId }, data: { status } });
    if (!result.count) throw new NotFoundException('Cita no encontrada');
    const updated = await this.prisma.appointment.findUniqueOrThrow({ where: { id } }); await this.audit.write({ tenantId: user.tenantId, clinicId, actorUserId: user.sub, action: 'appointment.status_changed', entityType: 'Appointment', entityId: id, metadata: { status } }); return updated;
  }
  private async reserve(tenantId: string, clinicId: string, input: { patientId: string; professionalId: string; serviceId?: string; roomId?: string; startsAt: string; endsAt: string }, replaceId?: string) {
    const startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
    if (!(startsAt < endsAt)) throw new ConflictException('El intervalo de la cita no es válido');
    return this.prisma.$transaction(async tx => {
      const [patient, professional] = await Promise.all([tx.patient.findFirst({ where: { id: input.patientId, tenantId, clinicId } }), tx.professional.findFirst({ where: { id: input.professionalId, tenantId, clinicId, active: true } })]);
      if (!patient || !professional) throw new NotFoundException('Paciente o profesional no encontrado');
      const service = input.serviceId ? await tx.service.findFirst({ where: { id: input.serviceId, tenantId, clinicId, active: true } }) : null;
      if (input.serviceId && !service) throw new NotFoundException('Tratamiento no encontrado');
      if (service && endsAt.getTime() - startsAt.getTime() !== service.durationMinutes * 60000) throw new ConflictException(`La duración de esta cita debe ser de ${service.durationMinutes} minutos según el tratamiento`);
      const room = input.roomId ? await tx.room.findFirst({ where: { id: input.roomId, tenantId, clinicId, active: true } }) : null;
      if (input.roomId && !room) throw new NotFoundException('Gabinete no encontrado');
      const [clinic, rules, timeOff] = await Promise.all([
        tx.clinic.findFirstOrThrow({ where: { id: clinicId, tenantId }, select: { timezone: true } }),
        tx.scheduleRule.findMany({ where: { tenantId, clinicId, professionalId: professional.id, active: true } }),
        tx.timeOff.findFirst({ where: { tenantId, clinicId, professionalId: professional.id, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } })
      ]);
      if (timeOff) throw new ConflictException('El profesional no está disponible por una ausencia');
      const startLocal = this.localParts(startsAt, clinic.timezone), endLocal = this.localParts(endsAt, clinic.timezone);
      const weekday = new Date(`${startLocal.date}T00:00:00Z`).getUTCDay();
      if (!rules.length) throw new ConflictException('El profesional todavía no tiene un horario configurado');
      if (startLocal.date !== endLocal.date || weekday < 1 || weekday > 5 || !rules.some(x => x.weekday === weekday && x.validFrom.toISOString().slice(0, 10) <= startLocal.date && x.validTo.toISOString().slice(0, 10) >= startLocal.date && x.startsAtMinute <= startLocal.minute && x.endsAtMinute >= endLocal.minute)) throw new ConflictException('La cita queda fuera del horario vigente del profesional. La jornada ordinaria es de lunes a viernes.');
      const clash = await tx.appointment.findFirst({ where: { tenantId, clinicId, professionalId: professional.id, ...(replaceId ? { id: { not: replaceId } } : {}), status: { in: ['SCHEDULED', 'CONFIRMED'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
      if (clash) throw new ConflictException('El profesional ya tiene una cita en ese horario');
      if (room && await tx.appointment.findFirst({ where: { tenantId, clinicId, roomId: room.id, ...(replaceId ? { id: { not: replaceId } } : {}), status: { in: ['SCHEDULED', 'CONFIRMED'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } })) throw new ConflictException('El gabinete ya está reservado en ese horario');
      if (replaceId) return tx.appointment.update({ where: { id: replaceId }, data: { patientId: patient.id, professionalId: professional.id, serviceId: service?.id, roomId: room?.id, startsAt, endsAt, status: 'SCHEDULED' } });
      const appointment = await tx.appointment.create({ data: { tenantId, clinicId, patientId: patient.id, professionalId: professional.id, serviceId: service?.id, roomId: room?.id, startsAt, endsAt } });
      await tx.automationEvent.create({ data: { tenantId, clinicId, type: 'appointment.created', payload: { appointmentId: appointment.id, patientId: patient.id, professionalId: professional.id, serviceId: service?.id, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } } });
      return appointment;
    });
  }

  private localParts(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const value = (type: string) => parts.find(item => item.type === type)?.value ?? '00';
    return { date: `${value('year')}-${value('month')}-${value('day')}`, minute: Number(value('hour')) * 60 + Number(value('minute')) };
  }
  private formatMinute(minute: number) { return `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`; }
}
