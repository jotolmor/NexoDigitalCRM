import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { IsISO8601, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../common/access';
import { ReportsService } from './reports.service';
class PeriodDto { @IsOptional() @IsISO8601() from?: string; @IsOptional() @IsISO8601() to?: string; }
@Controller('reports') @UseGuards(JwtAuthGuard) export class ReportsController { constructor(private reports: ReportsService) {} @Get('overview') overview(@Req() req: { user: SessionUser }, @Query() query: PeriodDto) { const to = query.to ? new Date(query.to) : new Date(); const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000); return this.reports.overview(req.user, from, to); } }
