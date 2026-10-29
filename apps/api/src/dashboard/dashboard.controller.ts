import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { SessionUser } from '../common/access';

class CalendarQuery { @Type(() => Number) @IsInt() @Min(2020) @Max(2100) year!: number; }

@Controller('dashboard') @UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private dashboard: DashboardService) {}
  @Get('summary') summary(@Req() req: { user: SessionUser }) { return this.dashboard.summary(req.user.tenantId, req.user.clinicId); }
  @Get('calendar') calendar(@Req() req: { user: SessionUser }, @Query() query: CalendarQuery) { return this.dashboard.calendar(req.user, query.year); }
}
