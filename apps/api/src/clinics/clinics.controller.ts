import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicsService } from './clinics.service';
@Controller('clinic') @UseGuards(JwtAuthGuard)
export class ClinicsController {
  constructor(private clinics: ClinicsService) {}
  @Get('me') current(@Req() req: { user: { tenantId: string; clinicId: string | null } }) { return this.clinics.current(req.user.tenantId, req.user.clinicId); }
}
