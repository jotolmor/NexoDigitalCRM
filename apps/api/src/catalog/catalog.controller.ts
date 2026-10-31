import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../common/access';
import { CatalogService } from './catalog.service';
class ProfessionalDto { @IsString() @MinLength(1) firstName!: string; @IsString() @MinLength(1) lastName!: string; @IsString() @MinLength(2) specialty!: string; @IsOptional() @IsEmail() email?: string; @IsOptional() @IsString() phone?: string; }
class ServiceDto { @IsString() @MinLength(2) name!: string; @IsOptional() @IsString() description?: string; @IsInt() @IsIn([15, 30, 60]) durationMinutes!: number; @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) priceEuros?: number; }
class ServiceDurationDto { @IsInt() @IsIn([15, 30, 60]) durationMinutes!: number; }
@Controller() @UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private catalog: CatalogService) {}
  @Get('professionals') professionals(@Req() req: { user: SessionUser }) { return this.catalog.listProfessionals(req.user); }
  @Post('professionals') createProfessional(@Req() req: { user: SessionUser }, @Body() body: ProfessionalDto) { return this.catalog.createProfessional(req.user, body); }
  @Get('services') services(@Req() req: { user: SessionUser }) { return this.catalog.listServices(req.user); }
  @Post('services') createService(@Req() req: { user: SessionUser }, @Body() body: ServiceDto) { return this.catalog.createService(req.user, body); }
  @Patch('services/:id/duration') updateServiceDuration(@Req() req: { user: SessionUser }, @Param('id') id: string, @Body() body: ServiceDurationDto) { return this.catalog.updateServiceDuration(req.user, id, body.durationMinutes); }
  @Post('professionals/:professionalId/services/:serviceId') assign(@Req() req: { user: SessionUser }, @Param('professionalId') professionalId: string, @Param('serviceId') serviceId: string) { return this.catalog.assignService(req.user, professionalId, serviceId); }
}
