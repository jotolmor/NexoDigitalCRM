import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser, requireOwner } from '../common/access';
import { AuditService } from './audit.service';
class AuditQuery { @IsOptional() @IsInt() @Min(1) @Max(200) take?: number; }
@Controller('audit-logs') @UseGuards(JwtAuthGuard) export class AuditController { constructor(private audit: AuditService) {} @Get() list(@Req() req: { user: SessionUser }, @Query() query: AuditQuery) { const clinicId = requireOwner(req.user); return this.audit.list(req.user.tenantId, clinicId, query.take ?? 50); } }
