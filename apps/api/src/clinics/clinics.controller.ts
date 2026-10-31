import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../common/access';
import { ClinicsService } from './clinics.service';
class UpdateClinicDto { @IsOptional() @IsString() @MaxLength(300) address?: string | null; }
@Controller('clinic') @UseGuards(JwtAuthGuard)
export class ClinicsController {
  constructor(private clinics: ClinicsService) {}
  @Get('me') current(@Req() req: { user: SessionUser }) { return this.clinics.current(req.user.tenantId, req.user.clinicId); }
  @Patch('me') update(@Req() req: { user: SessionUser }, @Body() body: UpdateClinicDto) { return this.clinics.update(req.user, body.address ?? null); }
}
