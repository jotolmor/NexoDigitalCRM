import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { SessionUser, requireOwner } from '../common/access';
import { PrismaService } from '../prisma.service';
import { UserRole } from '@prisma/client';
@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService, private auth: AuthService) {}
  list(user: SessionUser) { const clinicId = requireOwner(user); return this.prisma.user.findMany({ where: { tenantId: user.tenantId, clinicId }, select: { id: true, name: true, email: true, role: true, createdAt: true }, orderBy: { createdAt: 'asc' } }); }
  create(user: SessionUser, input: { name: string; email: string; password: string; role: UserRole }) { const clinicId = requireOwner(user); return this.auth.createMember(user.tenantId, clinicId, input); }
}
