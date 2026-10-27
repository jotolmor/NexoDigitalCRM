import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireOwner } from '../common/access';
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}
  listTemplates(user: SessionUser) { const clinicId = requireOwner(user); return this.prisma.notificationTemplate.findMany({ where: { tenantId: user.tenantId, clinicId }, orderBy: [{ channel: 'asc' }, { eventType: 'asc' }] }); }
  createTemplate(user: SessionUser, input: { channel: string; eventType: string; subject?: string; body: string }) {
    const clinicId = requireOwner(user);
    return this.prisma.notificationTemplate.upsert({ where: { clinicId_channel_eventType: { clinicId, channel: input.channel, eventType: input.eventType } }, update: { subject: input.subject, body: input.body, active: true }, create: { tenantId: user.tenantId, clinicId, ...input } });
  }
}
