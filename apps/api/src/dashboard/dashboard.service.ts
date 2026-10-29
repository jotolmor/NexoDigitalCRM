import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireClinic } from '../common/access';

type MinuteRange = { start: number; end: number };

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

  async calendar(user: SessionUser, year: number) {
    const clinicId = requireClinic(user);
    const clinic = await this.prisma.clinic.findFirstOrThrow({ where: { id: clinicId, tenantId: user.tenantId }, select: { timezone: true } });
    const windowStart = new Date(Date.UTC(year - 1, 11, 30));
    const windowEnd = new Date(Date.UTC(year + 1, 0, 3));
    const [professionals, appointments, timeOffs] = await Promise.all([
      this.prisma.professional.findMany({ where: { tenantId: user.tenantId, clinicId, active: true }, select: { id: true, scheduleRules: { where: { active: true }, select: { weekday: true, startsAtMinute: true, endsAtMinute: true, validFrom: true, validTo: true } } } }),
      this.prisma.appointment.findMany({ where: { tenantId: user.tenantId, clinicId, startsAt: { lt: windowEnd }, endsAt: { gt: windowStart }, status: { not: 'CANCELLED' } }, select: { professionalId: true, startsAt: true, endsAt: true } }),
      this.prisma.timeOff.findMany({ where: { tenantId: user.tenantId, clinicId, startsAt: { lt: windowEnd }, endsAt: { gt: windowStart } }, select: { professionalId: true, startsAt: true, endsAt: true } })
    ]);

    const records = new Map<string, { totalMinutes: number; occupiedMinutes: number }>();
    const weekdayByDate = new Map<string, number>();
    for (let d = new Date(Date.UTC(year, 0, 1)); d < new Date(Date.UTC(year + 1, 0, 1)); d.setUTCDate(d.getUTCDate() + 1)) {
      const date = this.dateKey(d); weekdayByDate.set(date, d.getUTCDay()); records.set(date, { totalMinutes: 0, occupiedMinutes: 0 });
    }

    for (const professional of professionals) {
      const appointmentsByDate = this.groupIntervals(appointments.filter(x => x.professionalId === professional.id), clinic.timezone);
      const timeOffByDate = this.groupIntervals(timeOffs.filter(x => x.professionalId === professional.id), clinic.timezone);
      for (const [date, weekday] of weekdayByDate) {
        const schedule = this.merge(professional.scheduleRules.filter(rule => rule.weekday === weekday && this.dateKey(rule.validFrom) <= date && this.dateKey(rule.validTo) >= date).map(rule => ({ start: rule.startsAtMinute, end: rule.endsAtMinute })));
        if (!schedule.length) continue;
        const row = records.get(date)!;
        row.totalMinutes += schedule.reduce((sum, range) => sum + range.end - range.start, 0);
        const unavailable = this.merge([...(appointmentsByDate.get(date) ?? []), ...(timeOffByDate.get(date) ?? [])]);
        row.occupiedMinutes += schedule.reduce((sum, working) => sum + unavailable.reduce((minutes, busy) => minutes + Math.max(0, Math.min(working.end, busy.end) - Math.max(working.start, busy.start)), 0), 0);
      }
    }

    return { year, timezone: clinic.timezone, days: [...records].map(([date, value]) => ({ date, ...value, status: value.totalMinutes === 0 ? 'closed' : value.occupiedMinutes === 0 ? 'free' : value.occupiedMinutes >= value.totalMinutes ? 'full' : 'partial' })) };
  }

  private dateKey(date: Date) { return date.toISOString().slice(0, 10); }

  private groupIntervals(items: { startsAt: Date; endsAt: Date }[], timezone: string) {
    const grouped = new Map<string, MinuteRange[]>();
    for (const item of items) {
      const start = this.localParts(item.startsAt, timezone); const end = this.localParts(item.endsAt, timezone);
      for (let cursor = new Date(`${start.date}T00:00:00Z`); cursor <= new Date(`${end.date}T00:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        const date = this.dateKey(cursor); const from = date === start.date ? start.minute : 0; const to = date === end.date ? end.minute : 1440;
        if (to <= from) continue;
        const ranges = grouped.get(date) ?? []; ranges.push({ start: from, end: to }); grouped.set(date, ranges);
      }
    }
    return grouped;
  }

  private localParts(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const part = (type: string) => parts.find(value => value.type === type)?.value ?? '00';
    return { date: `${part('year')}-${part('month')}-${part('day')}`, minute: Number(part('hour')) * 60 + Number(part('minute')) };
  }

  private merge(ranges: MinuteRange[]) {
    const sorted = ranges.filter(range => range.end > range.start).sort((a, b) => a.start - b.start);
    const merged: MinuteRange[] = [];
    for (const range of sorted) { const last = merged[merged.length - 1]; if (last && range.start <= last.end) last.end = Math.max(last.end, range.end); else merged.push({ ...range }); }
    return merged;
  }
}
