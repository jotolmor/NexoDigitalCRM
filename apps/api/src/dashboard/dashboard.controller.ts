import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
@Controller('dashboard') @UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private dashboard: DashboardService) {}
  @Get('summary') summary(@Req() req: { user: { tenantId: string; clinicId: string | null } }) { return this.dashboard.summary(req.user.tenantId, req.user.clinicId); }
}
