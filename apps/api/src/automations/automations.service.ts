import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireOwner } from '../common/access';
import { appointmentMessage, contactPhone } from './automation-message';
import { reminderStage } from './reminder-schedule';
export type Connection = { id: string; tenantId: string; clinicId: string; tokenHash: string; enabled: boolean; mode: string; channels: string[]; reminderMinutes: number; reminderOffsetsMinutes?: number[]; createdAt: Date };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const include = { patient: { select: { firstName: true, phone: true } } };
@Injectable()
export class AutomationsService {
  constructor(private prisma: PrismaService) {}
  private scope(user: SessionUser) { return { tenantId: user.tenantId, clinicId: requireOwner(user) }; }
  async connect(user: SessionUser) {
    const scope = this.scope(user);
    if (await this.prisma.automationConnection.findFirst({ where: scope })) throw new ConflictException('La conexión ya existe. Usa la rotación de clave si necesitas una nueva.');
    const apiKey = 'nexo_n8n_' + randomBytes(32).toString('hex');
    const connection = await this.prisma.automationConnection.create({ data: { ...scope, tokenHash: hash(apiKey), mode: 'DRY_RUN' } });
    return { apiKey, mode: connection.mode, channels: connection.channels, message: 'Guarda esta clave en una credencial Header Auth de n8n. Sólo se muestra ahora. La conexión está en modo de prueba.' };
  }
  async configure(user: SessionUser, data: { enabled?: boolean; mode?: string; channels?: string[]; reminderMinutes?: number; reminderOffsetsMinutes?: number[] }) {
    const scope = this.scope(user);
    if (data.reminderOffsetsMinutes) data.reminderOffsetsMinutes = [...new Set(data.reminderOffsetsMinutes)].sort((a,b) => b-a);
    const result = await this.prisma.automationConnection.updateMany({ where: scope, data });
    if (!result.count) throw new NotFoundException('Crea primero la conexión con n8n.');
    return this.status(user);
  }
  async rotate(user: SessionUser) {
    const scope = this.scope(user), apiKey = 'nexo_n8n_' + randomBytes(32).toString('hex');
    const result = await this.prisma.automationConnection.updateMany({ where: scope, data: { tokenHash: hash(apiKey) } });
    if (!result.count) throw new NotFoundException('Conexión no encontrada.');
    return { apiKey };
  }
  async authenticate(authorization?: string): Promise<Connection> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!/^nexo_n8n_[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException();
    const connection = await this.prisma.automationConnection.findUnique({ where: { tokenHash: hash(token) } });
    if (!connection || !connection.enabled) throw new UnauthorizedException();
    return connection;
  }
  async status(user: SessionUser) {
    const scope = this.scope(user);
    const connection = await this.prisma.automationConnection.findFirst({ where: scope, select: { enabled: true, mode: true, channels: true, reminderMinutes: true, reminderOffsetsMinutes: true, createdAt: true } });
    const counts = await this.prisma.notification.groupBy({ by: ['status'], where: scope, _count: { _all: true } });
    return { connection, counts: counts.map(item => ({ status: item.status, count: item._count._all })) };
  }
  private async enqueue(connection: Connection, appointment: any, clinic: any, eventType: string, key: string, schedule?: { minutes: number; dueAt: Date; expiresAt: Date }) {
    const scope = { tenantId: connection.tenantId, clinicId: connection.clinicId };
    const phone = contactPhone(appointment.patient.phone);
    await this.prisma.notification.createMany({ skipDuplicates: true, data: [...new Set(connection.channels)].map(channel => ({ ...scope, patientId: appointment.patientId, appointmentId: appointment.id, deduplicationKey: `${key}:${connection.mode}:${channel}:${hash(phone ?? "invalid")}`, channel, eventType, recipient: phone ?? '', payload: { ...appointmentMessage(appointment, clinic, eventType), mode: connection.mode, version: appointment.notificationVersion, ...(schedule ? { reminderStageMinutes: schedule.minutes, reminderExpiresAt: schedule.expiresAt.toISOString() } : {}) }, ...(schedule ? { scheduledAt: schedule.dueAt } : {}), status: phone ? 'PENDING' : 'FAILED', lastError: phone ? null : 'invalid_phone' })) });
  }
  private async prepare(connection: Connection) {
    const scope = { tenantId: connection.tenantId, clinicId: connection.clinicId }, now = new Date();
    const clinic = await this.prisma.clinic.findFirstOrThrow({ where: { id: connection.clinicId, tenantId: connection.tenantId }, select: { name: true, timezone: true } });
    // An interrupted provider request is ambiguous: never automatically resend it.
    await this.prisma.notification.updateMany({ where: { ...scope, status: 'PROCESSING', claimedAt: { lt: new Date(Date.now() - 30 * 60000) } }, data: { status: 'FAILED', lastError: 'delivery_uncertain_review_required' } });
    const events = await this.prisma.automationEvent.findMany({ where: { ...scope, status: 'PENDING', createdAt: { gte: connection.createdAt }, availableAt: { lte: now }, type: { in: ['appointment.created', 'appointment.rescheduled', 'appointment.status_changed'] } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100 });
    for (const event of events) {
      const payload = event.payload as any;
      const appointment = typeof payload?.appointmentId === 'string' ? await this.prisma.appointment.findFirst({ where: { ...scope, id: payload.appointmentId }, include }) : null;
      if (appointment && appointment.startsAt > now && payload.version === appointment.notificationVersion) {
        const type = event.type === 'appointment.status_changed' ? payload.status === 'CANCELLED' ? 'appointment.cancelled' : payload.status === 'CONFIRMED' ? 'appointment.confirmed' : null : event.type;
        if (type && (type === 'appointment.cancelled' ? appointment.status === 'CANCELLED' : type === 'appointment.confirmed' ? appointment.status === 'CONFIRMED' : ['SCHEDULED', 'CONFIRMED'].includes(appointment.status))) {
          if (event.type === 'appointment.rescheduled' || type === 'appointment.cancelled') await this.prisma.notification.updateMany({ where: { ...scope, appointmentId: appointment.id, createdAt: { lt: event.createdAt }, status: { in: ['PENDING', 'PROCESSING'] } }, data: { status: 'CANCELLED', lastError: 'appointment_changed' } });
          await this.enqueue(connection, appointment, clinic, type, `event:${event.id}`);
        }
      }
      await this.prisma.automationEvent.updateMany({ where: { ...scope, id: event.id, status: 'PENDING' }, data: { status: 'DELIVERED', deliveredAt: now } });
    }
    const upcoming = await this.prisma.appointment.findMany({ where: { ...scope, status: { in: ['SCHEDULED', 'CONFIRMED'] }, startsAt: { gt: now, lte: new Date(Date.now() + Math.max(...(connection.reminderOffsetsMinutes ?? [connection.reminderMinutes])) * 60000) } }, include });
    for (const appointment of upcoming) {
      const key = `reminder:${connection.clinicId}:${appointment.id}:${appointment.startsAt.toISOString()}:${appointment.notificationVersion}`;
      if (connection.reminderOffsetsMinutes) {
        const stage = reminderStage(appointment.startsAt, now, connection.reminderOffsetsMinutes);
        if (stage) await this.enqueue(connection, appointment, clinic, 'appointment.reminder', `${key}:stage:${stage.minutes}`, stage);
      } else await this.enqueue(connection, appointment, clinic, 'appointment.reminder', key);
    }
  }
  async claim(connection: Connection, limit: number) {
    await this.prepare(connection);
    const scope = { tenantId: connection.tenantId, clinicId: connection.clinicId };
    const pending = await this.prisma.notification.findMany({ where: { ...scope, status: 'PENDING', channel: { in: connection.channels }, scheduledAt: { lte: new Date() } }, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }], take: limit });
    const jobs = [];
    for (const job of pending) {
      const payload = job.payload as any;
      if (job.eventType === 'appointment.reminder' && connection.reminderOffsetsMinutes
          && (!payload.reminderExpiresAt || new Date(payload.reminderExpiresAt) <= new Date()
              || reminderStage(new Date(payload.startsAt), new Date(), connection.reminderOffsetsMinutes)?.minutes !== payload.reminderStageMinutes)) {
        await this.prisma.notification.updateMany({ where: { ...scope, id: job.id, status: 'PENDING' }, data: { status: 'CANCELLED', lastError: 'reminder_window_expired' } });
        continue;
      }
      const deliveryToken = randomBytes(24).toString('hex');
      const result = await this.prisma.notification.updateMany({ where: { ...scope, id: job.id, status: 'PENDING' }, data: { status: 'PROCESSING', deliveryTokenHash: hash(deliveryToken), claimedAt: new Date() } });
      if (result.count) jobs.push({ id: job.id, deliveryToken, channel: job.channel, eventType: job.eventType, recipient: job.recipient, ...(job.payload as any) });
    }
    return { jobs };
  }
  private async claimed(connection: Connection, id: string, token: string) {
    const job = await this.prisma.notification.findFirst({ where: { id, tenantId: connection.tenantId, clinicId: connection.clinicId, deliveryTokenHash: hash(token) } });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');
    return job;
  }
  async validate(connection: Connection, id: string, token: string) {
    const job = await this.claimed(connection, id, token), payload = job.payload as any;
    if (job.status !== 'PROCESSING' || !job.appointmentId || !job.claimedAt || Date.now() - job.claimedAt.getTime() > 30 * 60000) return { allowed: false };
    const appointment = await this.prisma.appointment.findFirst({ where: { id: job.appointmentId, tenantId: connection.tenantId, clinicId: connection.clinicId }, include });
    const validStatus = appointment && (job.eventType === 'appointment.cancelled' ? appointment.status === 'CANCELLED' : ['SCHEDULED', 'CONFIRMED'].includes(appointment.status));
    const inReminderWindow = job.eventType !== 'appointment.reminder' || !connection.reminderOffsetsMinutes
      || Boolean(payload.reminderExpiresAt && new Date(payload.reminderExpiresAt) > new Date() && reminderStage(new Date(payload.startsAt), new Date(), connection.reminderOffsetsMinutes)?.minutes === payload.reminderStageMinutes);
    const allowed = Boolean(inReminderWindow && job.scheduledAt <= new Date() && connection.channels.includes(job.channel) && validStatus && appointment.startsAt > new Date() && appointment.startsAt.toISOString() === payload.startsAt && appointment.notificationVersion === payload.version && contactPhone(appointment.patient.phone) === job.recipient && (payload.mode === 'DRY_RUN' || connection.mode === 'LIVE'));
    if (!allowed) await this.prisma.notification.updateMany({ where: { id: job.id, tenantId: connection.tenantId, clinicId: connection.clinicId, status: 'PROCESSING' }, data: { status: 'CANCELLED', lastError: 'appointment_changed_or_paused' } });
    return { allowed, mode: payload.mode };
  }
  async result(connection: Connection, id: string, input: { deliveryToken: string; status: 'SENT' | 'FAILED' | 'SIMULATED'; providerMessageId?: string }) {
    const job = await this.claimed(connection, id, input.deliveryToken);
    if (['SENT', 'SIMULATED', 'FAILED', 'CANCELLED'].includes(job.status)) return { status: job.status };
    if (input.status === 'SENT' && (!(job.payload as any).mode || (job.payload as any).mode !== 'LIVE' || !input.providerMessageId)) throw new ConflictException('Un trabajo de prueba no puede marcarse como envío real.');
    await this.prisma.notification.updateMany({ where: { id, tenantId: connection.tenantId, clinicId: connection.clinicId, status: 'PROCESSING', deliveryTokenHash: hash(input.deliveryToken) }, data: { status: input.status, sentAt: input.status === 'SENT' ? new Date() : undefined, providerMessageId: input.providerMessageId, lastError: input.status === 'FAILED' ? 'provider_failed_review_required' : null } });
    return { status: input.status };
  }
}
