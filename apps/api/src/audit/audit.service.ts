import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
@Injectable() export class AuditService { constructor(private prisma: PrismaService) {} write(input: { tenantId: string; clinicId: string; actorUserId?: string; action: string; entityType: string; entityId: string; metadata?: object }) { return this.prisma.auditLog.create({ data: input }); } list(tenantId: string, clinicId: string, take = 50) { return this.prisma.auditLog.findMany({ where: { tenantId, clinicId }, orderBy: { createdAt: 'desc' }, take }); } }
